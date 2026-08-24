import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { downloadWhisperModel } from '../../src/core/ai/model-downloader'
import type { AsrModelDownloadProgress } from '../../src/shared/media-types'
import type { AsrModelManifest } from '../../src/shared/media-types'

function createFixtureManifest(bytes: Uint8Array, sourceUrls: string[] = ['https://modelscope.example/model.bin']): AsrModelManifest {
  const sha256 = createHash('sha256').update(bytes).digest('hex')
  return {
    id: 'fixture-model',
    name: 'Fixture model',
    fileName: 'fixture-model.bin',
    sources: sourceUrls.map((url, index) => ({
      id: index === 0 ? 'r2' : 'modelscope',
      name: index === 0 ? 'R2' : 'ModelScope',
      region: 'test',
      url,
      description: 'test',
      sha256
    })),
    expectedSizeBytes: bytes.byteLength,
    sha256,
    ramRequirement: 'test',
    description: 'test'
  }
}

describe('model downloader', () => {
  let tempDirectory: string

  beforeEach(async () => {
    tempDirectory = await mkdtemp(join(tmpdir(), 'aivplayer-model-download-'))
  })

  afterEach(async () => {
    await rm(tempDirectory, { recursive: true, force: true })
  })

  it('downloads the selected source and verifies the manifest size and SHA-256', async () => {
    const urls: string[] = []
    const progressEvents: AsrModelDownloadProgress[] = []
    const bytes = new Uint8Array([1, 2, 3, 4])

    const model = await downloadWhisperModel({
      modelDirectory: tempDirectory,
      modelId: 'large-v3-turbo-q5_0',
      sourceId: 'modelscope',
      manifest: createFixtureManifest(bytes, ['https://r2.example/model.bin', 'https://modelscope.example/model.bin']),
      onProgress: (progress) => progressEvents.push(progress),
      fetchImpl: async (url) => {
        urls.push(String(url))
        return new Response(bytes, {
          status: 200,
          headers: {
            'content-length': String(bytes.byteLength)
          }
        })
      }
    })

    expect(urls).toEqual(['https://modelscope.example/model.bin'])
    expect(model.sizeBytes).toBe(bytes.byteLength)
    expect(await readFile(model.path)).toEqual(Buffer.from(bytes))
    expect(progressEvents.at(-1)).toMatchObject({
      sourceId: 'modelscope',
      sourceName: 'ModelScope',
      message: '模型下载完成。'
    })
  })

  it('invalidates a corrupt cache and automatically falls back to the next source', async () => {
    const bytes = new Uint8Array([1, 2, 3, 4])
    const manifest = createFixtureManifest(bytes, ['https://r2.example/model.bin', 'https://modelscope.example/model.bin'])
    const modelPath = `${tempDirectory}/${manifest.fileName}`
    await import('node:fs/promises').then(({ writeFile }) => writeFile(modelPath, new Uint8Array([9, 9, 9, 9])))
    const urls: string[] = []

    const model = await downloadWhisperModel({
      modelDirectory: tempDirectory,
      manifest,
      fetchImpl: async (url) => {
        urls.push(String(url))
        if (String(url).includes('r2.example')) return new Response(new Uint8Array([0]), { status: 200 })
        return new Response(bytes, { status: 200 })
      }
    })

    expect(urls).toEqual(['https://r2.example/model.bin', 'https://modelscope.example/model.bin'])
    expect(model.sizeBytes).toBe(bytes.byteLength)
    await expect(readFile(model.path)).resolves.toEqual(Buffer.from(bytes))
  })

  it('does not leave a bad final file after every source fails integrity verification', async () => {
    const bytes = new Uint8Array([1, 2, 3, 4])
    const manifest = createFixtureManifest(bytes, ['https://r2.example/model.bin', 'https://modelscope.example/model.bin'])
    const modelPath = `${tempDirectory}/${manifest.fileName}`

    await expect(downloadWhisperModel({
      modelDirectory: tempDirectory,
      manifest,
      fetchImpl: async () => new Response(new Uint8Array([0, 0, 0, 0]), { status: 200 })
    })).rejects.toThrow('SHA-256')
    await expect(readFile(modelPath)).rejects.toThrow()
  })
})
