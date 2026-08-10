import { mkdir, mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { downloadVisionModel } from '../../src/core/ai/vision-model-downloader'
import { VISION_MODEL_FILES, VISION_MODEL_ID, VISION_MODEL_REPOSITORY, VISION_MODEL_REVISION } from '../../src/shared/vision-types'

const temporaryDirectories: string[] = []

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })))
})

function createResponse(content: string): Response {
  return new Response(content, { status: 200, headers: { 'content-length': String(Buffer.byteLength(content)) } })
}

describe('vision model downloader', () => {
  it('downloads the pinned model layout into user data and reports progress', async () => {
    const modelRoot = await mkdtemp(join(tmpdir(), 'aivplayer-vision-model-'))
    temporaryDirectories.push(modelRoot)
    const urls: string[] = []
    const progress: string[] = []
    const result = await downloadVisionModel({
      modelRoot,
      baseUrl: 'https://models.example.test',
      fetchImpl: async (input) => {
        urls.push(String(input))
        return createResponse(`model:${String(input)}`)
      },
      onProgress: (next) => progress.push(`${next.status}:${next.relativePath}`)
    })

    expect(result.modelDirectory).toBe(join(modelRoot, 'models', 'vision', VISION_MODEL_ID))
    expect(urls).toHaveLength(VISION_MODEL_FILES.length)
    expect(urls[0]).toBe(`https://models.example.test/${VISION_MODEL_REPOSITORY}/resolve/${VISION_MODEL_REVISION}/config.json`)
    await expect(readFile(join(result.modelDirectory, 'onnx', 'vision_model_uint8.onnx'), 'utf8')).resolves.toContain('vision_model_uint8.onnx')
    expect(progress).toContain('completed:onnx/vision_model_uint8.onnx')
    await expect(stat(join(result.modelDirectory, 'config.json'))).resolves.toBeTruthy()
  })

  it('reuses non-empty files without making another request', async () => {
    const modelRoot = await mkdtemp(join(tmpdir(), 'aivplayer-vision-model-cache-'))
    temporaryDirectories.push(modelRoot)
    const modelDirectory = join(modelRoot, 'models', 'vision', VISION_MODEL_ID)
    await mkdir(join(modelDirectory, 'onnx'), { recursive: true })
    for (const file of VISION_MODEL_FILES) {
      const filePath = join(modelDirectory, file)
      await mkdir(join(filePath, '..'), { recursive: true })
      await writeFile(filePath, `cached:${file}`)
    }

    let requestCount = 0
    await downloadVisionModel({ modelRoot, fetchImpl: async () => { requestCount += 1; return createResponse('unexpected') } })
    expect(requestCount).toBe(0)
  })
})
