import { chmod, mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { checkPackagedResources } from '../../scripts/check-packaged-resources'

const temporaryDirectories: string[] = []

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })))
})

async function createResourceFixture(): Promise<string> {
  const directory = await mkdtemp(join(tmpdir(), 'aivplayer-packaged-resources-'))
  temporaryDirectories.push(directory)
  await mkdir(join(directory, 'web', 'assets'), { recursive: true })
  await mkdir(join(directory, 'ffmpeg'))
  await writeFile(join(directory, 'web', 'index.html'), '<!doctype html>')
  await writeFile(join(directory, 'web', 'assets', 'index.js'), 'ready')
  await writeFile(join(directory, 'ffmpeg', 'ffmpeg'), 'ffmpeg')
  await writeFile(join(directory, 'ffmpeg', 'ffprobe'), 'ffprobe')
  await writeFile(join(directory, 'LICENSE'), 'MIT License')
  await writeFile(join(directory, 'THIRD_PARTY_LICENSES.md'), '# licenses')
  await writeFile(join(directory, 'vision-model-manifest.json'), '{}')
  await writeFile(join(directory, 'runtime-metadata.json'), JSON.stringify({
    schemaVersion: 1,
    applicationVersion: '0.4.0',
    platform: 'darwin',
    components: {
      whisperCpp: {},
      ffmpeg: {},
      ffprobe: {},
      libheif: {},
      siglip2: { files: [] }
    }
  }))
  await chmod(join(directory, 'ffmpeg', 'ffmpeg'), 0o755)
  await chmod(join(directory, 'ffmpeg', 'ffprobe'), 0o755)
  return directory
}

describe('checkPackagedResources', () => {
  it('accepts the unpacked resources layout used by macOS and Linux', async () => {
    const resourcePath = await createResourceFixture()
    const result = await checkPackagedResources({ resourcePath, platform: 'darwin' })
    expect(result.ok).toBe(true)
    expect(result.missing).toEqual([])
  })

  it('uses Windows executable names and reports missing Web assets', async () => {
    const resourcePath = await createResourceFixture()
    await rm(join(resourcePath, 'web', 'assets'), { recursive: true, force: true })
    await writeFile(join(resourcePath, 'ffmpeg', 'ffmpeg.exe'), 'ffmpeg')
    await writeFile(join(resourcePath, 'ffmpeg', 'ffprobe.exe'), 'ffprobe')
    const result = await checkPackagedResources({ resourcePath, platform: 'win32' })
    expect(result.ok).toBe(false)
    expect(result.missing).toContain(join(resourcePath, 'web', 'assets'))
    expect(result.missing).not.toContain(join(resourcePath, 'ffmpeg', 'ffmpeg.exe'))
  })

  it('requires the project and third-party license files in packaged resources', async () => {
    const resourcePath = await createResourceFixture()
    await rm(join(resourcePath, 'LICENSE'), { force: true })
    await rm(join(resourcePath, 'THIRD_PARTY_LICENSES.md'), { force: true })

    const result = await checkPackagedResources({ resourcePath, platform: 'darwin' })

    expect(result.ok).toBe(false)
    expect(result.missing).toEqual([
      join(resourcePath, 'LICENSE'),
      join(resourcePath, 'THIRD_PARTY_LICENSES.md')
    ])
  })

  it('requires runtime metadata in packaged resources', async () => {
    const resourcePath = await createResourceFixture()
    await rm(join(resourcePath, 'runtime-metadata.json'), { force: true })

    const result = await checkPackagedResources({ resourcePath, platform: 'darwin' })

    expect(result.ok).toBe(false)
    expect(result.missing).toEqual([join(resourcePath, 'runtime-metadata.json')])
  })

  it('rejects malformed runtime metadata instead of checking file existence only', async () => {
    const resourcePath = await createResourceFixture()
    await writeFile(join(resourcePath, 'runtime-metadata.json'), '{"schemaVersion":1}')

    const result = await checkPackagedResources({ resourcePath, platform: 'darwin' })

    expect(result.ok).toBe(false)
    expect(result.missing).toEqual([join(resourcePath, 'runtime-metadata.json')])
  })

  it('accepts explicit platform names for cross-platform artifact checks', async () => {
    const resourcePath = await createResourceFixture()
    await rm(join(resourcePath, 'ffmpeg', 'ffmpeg'), { force: true })
    await rm(join(resourcePath, 'ffmpeg', 'ffprobe'), { force: true })
    await writeFile(join(resourcePath, 'ffmpeg', 'ffmpeg.exe'), 'ffmpeg')
    await writeFile(join(resourcePath, 'ffmpeg', 'ffprobe.exe'), 'ffprobe')

    const result = await checkPackagedResources({ resourcePath, platform: 'win32' })

    expect(result.ok).toBe(true)
    expect(result.checked).toContain(join(resourcePath, 'ffmpeg', 'ffmpeg.exe'))
  })
})
