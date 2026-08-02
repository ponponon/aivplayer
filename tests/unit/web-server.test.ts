import { mkdir, mkdtemp, readFile, rm, truncate, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { WebServer } from '../../src/desktop/web/web-server'

const temporaryDirectories: string[] = []

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })))
})

async function createFixture(): Promise<{ directory: string; mediaPath: string; webRoot: string }> {
  const directory = await mkdtemp(join(tmpdir(), 'aivplayer-web-server-'))
  temporaryDirectories.push(directory)
  const webRoot = join(directory, 'web')
  await mkdir(webRoot)
  await writeFile(join(webRoot, 'index.html'), '<!doctype html><title>AIVPlayer LAN Web</title>')
  const mediaPath = join(directory, 'sample.mp4')
  await writeFile(mediaPath, Buffer.from('0123456789', 'utf8'))
  await writeFile(join(directory, 'sample.srt'), '1\n00:00:00,000 --> 00:00:01,000\nHello\n')
  return { directory, mediaPath, webRoot }
}

describe('WebServer', () => {
  it('serves the web app, authenticated library and subtitle sidecar', async () => {
    const fixture = await createFixture()
    const server = new WebServer({ resourcePath: fixture.directory, webRoot: fixture.webRoot, bindHost: '127.0.0.1' })
    const status = await server.start({ filePaths: [fixture.mediaPath] })
    const accessUrl = new URL(status.urls[0]!)

    const unauthorizedResponse = await fetch(new URL('/api/v1/library', accessUrl))
    expect(unauthorizedResponse.status).toBe(401)

    const pageResponse = await fetch(accessUrl, { redirect: 'manual' })
    expect(pageResponse.status).toBe(302)
    expect(pageResponse.headers.get('location')).toBe('/')
    const cookie = pageResponse.headers.get('set-cookie')?.split(';')[0]
    expect(cookie).toBeTruthy()

    const page = await fetch(new URL('/', accessUrl), { headers: { Cookie: cookie! } })
    expect(page.status).toBe(200)
    expect(await page.text()).toContain('AIVPlayer LAN Web')

    const libraryResponse = await fetch(new URL('/api/v1/library', accessUrl), { headers: { Cookie: cookie! } })
    expect(libraryResponse.status).toBe(200)
    const library = await libraryResponse.json() as { items: Array<{ id: string; subtitleUrl: string | null; transcodeUrl: string }> }
    expect(library.items).toHaveLength(1)
    expect(library.items[0]?.subtitleUrl).toMatch(/^\/subtitle\//u)
    expect(library.items[0]?.transcodeUrl).toMatch(/^\/api\/v1\/media\//u)

    const subtitleResponse = await fetch(new URL(library.items[0]!.subtitleUrl!, accessUrl), { headers: { Cookie: cookie! } })
    expect(subtitleResponse.status).toBe(200)
    expect(await subtitleResponse.text()).toContain('WEBVTT')

    const transcodeResponse = await fetch(new URL(library.items[0]!.transcodeUrl, accessUrl), { method: 'POST', headers: { Cookie: cookie! } })
    expect(transcodeResponse.status).toBe(200)
    expect((await transcodeResponse.json() as { state: string }).state).toBe('queued')

    await server.stop()
  })

  it('supports byte-range, head and invalid-range responses without loading the whole file', async () => {
    const fixture = await createFixture()
    const server = new WebServer({ resourcePath: fixture.directory, webRoot: fixture.webRoot, bindHost: '127.0.0.1' })
    const status = await server.start({ filePaths: [fixture.mediaPath] })
    const accessUrl = new URL(status.urls[0]!)
    const pageResponse = await fetch(accessUrl, { redirect: 'manual' })
    const cookie = pageResponse.headers.get('set-cookie')?.split(';')[0]
    const libraryResponse = await fetch(new URL('/api/v1/library', accessUrl), { headers: { Cookie: cookie! } })
    const library = await libraryResponse.json() as { items: Array<{ streamUrl: string }> }
    const streamUrl = new URL(library.items[0]!.streamUrl, accessUrl)

    const rangeResponse = await fetch(streamUrl, { headers: { Cookie: cookie!, Range: 'bytes=2-5' } })
    expect(rangeResponse.status).toBe(206)
    expect(rangeResponse.headers.get('accept-ranges')).toBe('bytes')
    expect(rangeResponse.headers.get('content-range')).toBe('bytes 2-5/10')
    expect(Buffer.from(await rangeResponse.arrayBuffer()).toString('utf8')).toBe('2345')

    const headResponse = await fetch(streamUrl, { method: 'HEAD', headers: { Cookie: cookie!, Range: 'bytes=7-' } })
    expect(headResponse.status).toBe(206)
    expect(headResponse.headers.get('content-length')).toBe('3')
    expect(await headResponse.text()).toBe('')

    const invalidResponse = await fetch(streamUrl, { headers: { Cookie: cookie!, Range: 'bytes=10-12' } })
    expect(invalidResponse.status).toBe(416)
    expect(invalidResponse.headers.get('content-range')).toBe('bytes */10')

    await server.stop()
    expect(await readFile(fixture.mediaPath, 'utf8')).toBe('0123456789')
  })

  it('streams a sparse 5 GiB source by range without reading the whole file', async () => {
    const fixture = await createFixture()
    const fiveGiB = 5 * 1024 ** 3
    await truncate(fixture.mediaPath, fiveGiB)
    const server = new WebServer({ resourcePath: fixture.directory, webRoot: fixture.webRoot, bindHost: '127.0.0.1' })
    const status = await server.start({ filePaths: [fixture.mediaPath] })
    const accessUrl = new URL(status.urls[0]!)
    const pageResponse = await fetch(accessUrl, { redirect: 'manual' })
    const cookie = pageResponse.headers.get('set-cookie')?.split(';')[0]
    const libraryResponse = await fetch(new URL('/api/v1/library', accessUrl), { headers: { Cookie: cookie! } })
    const library = await libraryResponse.json() as { items: Array<{ streamUrl: string; sizeBytes: number }> }
    const streamUrl = new URL(library.items[0]!.streamUrl, accessUrl)
    const rangeStart = fiveGiB - 16
    const rangeResponse = await fetch(streamUrl, { headers: { Cookie: cookie!, Range: `bytes=${rangeStart}-${fiveGiB - 1}` } })

    expect(library.items[0]?.sizeBytes).toBe(fiveGiB)
    expect(rangeResponse.status).toBe(206)
    expect(rangeResponse.headers.get('content-range')).toBe(`bytes ${rangeStart}-${fiveGiB - 1}/${fiveGiB}`)
    expect((await rangeResponse.arrayBuffer()).byteLength).toBe(16)

    await server.stop()
  })

  it('shares nested video files from selected directories and refreshes incrementally', async () => {
    const fixture = await createFixture()
    const sharedDirectory = join(fixture.directory, 'library')
    const nestedDirectory = join(sharedDirectory, 'nested')
    await mkdir(nestedDirectory, { recursive: true })
    const firstPath = join(sharedDirectory, 'first.mp4')
    const secondPath = join(nestedDirectory, 'second.mkv')
    await writeFile(firstPath, 'first')
    await writeFile(join(sharedDirectory, 'notes.txt'), 'ignore me')

    const server = new WebServer({ resourcePath: fixture.directory, webRoot: fixture.webRoot, bindHost: '127.0.0.1' })
    const status = await server.start({ filePaths: [], directoryPaths: [sharedDirectory] })
    expect(status.sharedDirectoryCount).toBe(1)
    expect(status.sharedFileCount).toBe(1)
    const accessUrl = new URL(status.urls[0]!)
    const pageResponse = await fetch(accessUrl, { redirect: 'manual' })
    const cookie = pageResponse.headers.get('set-cookie')?.split(';')[0]
    const firstLibraryResponse = await fetch(new URL('/api/v1/library', accessUrl), { headers: { Cookie: cookie! } })
    const firstLibrary = await firstLibraryResponse.json() as { items: Array<{ id: string; name: string }> }
    expect(firstLibrary.items.map((item) => item.name)).toEqual(['first.mp4'])
    const firstId = firstLibrary.items[0]!.id

    const unauthorizedRefresh = await fetch(new URL('/api/v1/library/refresh', accessUrl), { method: 'POST' })
    expect(unauthorizedRefresh.status).toBe(401)

    await writeFile(secondPath, 'second')
    const refreshResponse = await fetch(new URL('/api/v1/library/refresh', accessUrl), { method: 'POST', headers: { Cookie: cookie! } })
    expect(refreshResponse.status).toBe(200)
    const refreshedLibrary = await refreshResponse.json() as { items: Array<{ id: string; name: string }> }
    expect(refreshedLibrary.items.map((item) => item.name)).toEqual(['first.mp4', 'second.mkv'])
    expect(refreshedLibrary.items.find((item) => item.name === 'first.mp4')?.id).toBe(firstId)

    await server.stop()
  })
})
