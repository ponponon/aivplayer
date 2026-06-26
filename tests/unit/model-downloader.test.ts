import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { downloadWhisperModel } from '../../src/main/ai/model-downloader'
import type { AsrModelDownloadProgress } from '../../src/shared/media-types'

describe('model downloader', () => {
  let tempDirectory: string

  beforeEach(async () => {
    tempDirectory = await mkdtemp(join(tmpdir(), 'aivplayer-model-download-'))
  })

  afterEach(async () => {
    await rm(tempDirectory, { recursive: true, force: true })
  })

  it('downloads the recommended model from the selected source', async () => {
    const urls: string[] = []
    const progressEvents: AsrModelDownloadProgress[] = []
    const bytes = new Uint8Array([1, 2, 3, 4])

    const model = await downloadWhisperModel({
      modelDirectory: tempDirectory,
      modelId: 'large-v3-turbo-q5_0',
      sourceId: 'modelscope',
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

    expect(urls).toEqual([
      'https://modelscope.cn/models/timeless/whispercpp/resolve/master/ggml-large-v3-turbo-q5_0.bin'
    ])
    expect(model.sizeBytes).toBe(bytes.byteLength)
    expect(await readFile(model.path)).toEqual(Buffer.from(bytes))
    expect(progressEvents.at(-1)).toMatchObject({
      sourceId: 'modelscope',
      sourceName: 'ModelScope',
      message: '模型下载完成。'
    })
  })
})
