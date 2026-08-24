import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { downloadPersonMatteModel } from '../../src/core/ai/person-matte-downloader'
import { PERSON_MATTE_MODEL_FILES, getPersonMatteModelPaths } from '../../src/core/ai/person-matte-model'

const fixtureFiles = PERSON_MATTE_MODEL_FILES.map((file) => ({ ...file, expected: undefined }))

describe('person matte model downloader', () => {
  let tempDirectory: string

  beforeEach(async () => {
    tempDirectory = await mkdtemp(join(tmpdir(), 'aivplayer-person-matte-'))
  })

  afterEach(async () => {
    await rm(tempDirectory, { recursive: true, force: true })
  })

  it('downloads all model files atomically into the model layout', async () => {
    const requestedUrls: string[] = []
    const progress: Array<{ status: string; relativePath: string }> = []
    const bytes = new Uint8Array([1, 2, 3, 4])

    const paths = await downloadPersonMatteModel({
      modelRoot: tempDirectory,
      files: fixtureFiles,
      onProgress: (event) => progress.push({ status: event.status, relativePath: event.relativePath }),
      fetchImpl: async (url) => {
        requestedUrls.push(String(url))
        return new Response(bytes, { status: 200, headers: { 'content-length': String(bytes.byteLength) } })
      }
    })

    expect(requestedUrls).toEqual(PERSON_MATTE_MODEL_FILES.map((file) => file.url))
    expect(paths).toEqual(getPersonMatteModelPaths(tempDirectory))
    for (const file of PERSON_MATTE_MODEL_FILES) expect(await readFile(join(paths.modelDirectory, file.relativePath))).toEqual(Buffer.from(bytes))
    expect(progress.filter((event) => event.status === 'completed')).toHaveLength(PERSON_MATTE_MODEL_FILES.length)
  })

  it('reuses non-empty files without requesting them again', async () => {
    const paths = getPersonMatteModelPaths(tempDirectory)
    const firstBytes = new Uint8Array([9, 8, 7])
    await downloadPersonMatteModel({ modelRoot: tempDirectory, files: fixtureFiles, fetchImpl: async () => new Response(firstBytes, { status: 200 }) })
    const requestedUrls: string[] = []

    await downloadPersonMatteModel({ modelRoot: tempDirectory, files: fixtureFiles, fetchImpl: async (url) => { requestedUrls.push(String(url)); return new Response(new Uint8Array([0]), { status: 200 }) } })

    expect(requestedUrls).toEqual([])
    expect(await readFile(paths.modelPath)).toEqual(Buffer.from(firstBytes))
  })
})
