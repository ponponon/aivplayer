import { access, readFile, rm } from 'node:fs/promises'
import { constants } from 'node:fs'
import { mkdtemp } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { VISION_MODEL_FILES, VISION_MODEL_REPOSITORY, VISION_MODEL_REVISION } from '../../scripts/write-runtime-metadata'
import { prepareVisionModel } from '../../scripts/prepare-vision-model'

const temporaryDirectories: string[] = []

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })))
})

describe('prepareVisionModel', () => {
  it('downloads the pinned model files atomically into the package resource layout', async () => {
    const resourcePath = await mkdtemp(join(tmpdir(), 'aivplayer-vision-model-'))
    temporaryDirectories.push(resourcePath)
    const requestedUrls: string[] = []
    const result = await prepareVisionModel({
      resourcePath,
      fetchImpl: async (input) => {
        requestedUrls.push(input)
        return new Response(`payload:${input}`, { status: 200 })
      }
    })

    expect(result.repository).toBe(VISION_MODEL_REPOSITORY)
    expect(result.revision).toBe(VISION_MODEL_REVISION)
    expect(result.downloaded).toEqual([...VISION_MODEL_FILES])
    expect(requestedUrls).toHaveLength(VISION_MODEL_FILES.length)
    expect(requestedUrls[0]).toContain(`/resolve/${VISION_MODEL_REVISION}/`)
    await access(join(resourcePath, 'vision', 'siglip2-base-patch16-224-ONNX', 'onnx', 'vision_model_uint8.onnx'), constants.F_OK)
    await expect(readFile(join(resourcePath, 'vision', 'siglip2-base-patch16-224-ONNX', '.aivplayer-model-revision'), 'utf8')).resolves.toContain(VISION_MODEL_REVISION)
  })

  it('does not redownload an already staged model', async () => {
    const resourcePath = await mkdtemp(join(tmpdir(), 'aivplayer-vision-model-existing-'))
    temporaryDirectories.push(resourcePath)
    await prepareVisionModel({ resourcePath, fetchImpl: async () => new Response('payload', { status: 200 }) })

    let fetchCount = 0
    const result = await prepareVisionModel({
      resourcePath,
      fetchImpl: async () => {
        fetchCount += 1
        throw new Error('unexpected redownload')
      }
    })

    expect(result.downloaded).toEqual([])
    expect(fetchCount).toBe(0)
  })
})
