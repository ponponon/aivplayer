import { createHash } from 'node:crypto'
import { execFile } from 'node:child_process'
import { mkdtemp, readFile, mkdir, rm, writeFile } from 'node:fs/promises'
import { promisify } from 'node:util'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { downloadVisionPack } from '../../src/core/ai/vision-pack-downloader'
import { VISION_PACK_ID, VISION_PACK_VERSION } from '../../src/core/ai/vision-pack'

const execFileAsync = promisify(execFile)
const temporaryDirectories: string[] = []

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })))
})

describe('vision pack downloader', () => {
  it('can download the legacy version-based manifest without a revision', async () => {
    const root = await mkdtemp(join(tmpdir(), 'aivplayer-vision-pack-download-'))
    const userDataPath = join(root, 'user-data')
    const packRoot = join(root, 'pack')
    const archiveRoot = join(root, 'archive')
    temporaryDirectories.push(root)
    await mkdir(join(packRoot, 'node_modules'), { recursive: true })
    await mkdir(archiveRoot, { recursive: true })
    await writeFile(join(packRoot, 'package.json'), '{"name":"aivplayer-vision-pack","main":"index.js"}\n')
    await writeFile(join(packRoot, 'vision-pack.json'), `${JSON.stringify({
      id: VISION_PACK_ID,
      version: VISION_PACK_VERSION,
      platform: process.platform,
      arch: process.arch,
      entry: 'package.json'
    })}\n`)
    const archivePath = join(archiveRoot, 'vision-pack.tar.gz')
    await execFileAsync('tar', ['-czf', archivePath, '-C', packRoot, '.'])
    const archiveBytes = await readFile(archivePath)
    const manifest = {
      id: VISION_PACK_ID,
      version: VISION_PACK_VERSION,
      platform: process.platform,
      arch: process.arch,
      entry: 'package.json',
      archive: 'vision-pack.tar.gz',
      sha256: createHash('sha256').update(archiveBytes).digest('hex'),
      sizeBytes: archiveBytes.byteLength
    }
    const requestedUrls: string[] = []

    const status = await downloadVisionPack({
      userDataPath,
      baseUrl: 'https://packs.example.test/aivplayer/vision-pack',
      fetchImpl: async (input) => {
        const url = String(input)
        requestedUrls.push(url)
        return url.endsWith('/manifest.json')
          ? new Response(JSON.stringify(manifest), { status: 200 })
          : new Response(archiveBytes, { status: 200 })
      }
    })

    expect(status.available).toBe(true)
    expect(requestedUrls).toEqual([
      `https://packs.example.test/aivplayer/vision-pack/${VISION_PACK_VERSION}/${process.platform}-${process.arch}/manifest.json`,
      `https://packs.example.test/aivplayer/vision-pack/${VISION_PACK_VERSION}/${process.platform}-${process.arch}/vision-pack.tar.gz`
    ])
  })
})
