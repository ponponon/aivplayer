import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
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
    const library = await libraryResponse.json() as { items: Array<{ id: string; subtitleUrl: string | null }> }
    expect(library.items).toHaveLength(1)
    expect(library.items[0]?.subtitleUrl).toMatch(/^\/subtitle\//u)

    const subtitleResponse = await fetch(new URL(library.items[0]!.subtitleUrl!, accessUrl), { headers: { Cookie: cookie! } })
    expect(subtitleResponse.status).toBe(200)
    expect(await subtitleResponse.text()).toContain('WEBVTT')

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
})
