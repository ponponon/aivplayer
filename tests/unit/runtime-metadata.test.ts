import { chmod, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { VISION_MODEL_FILES, writeRuntimeMetadata } from '../../scripts/write-runtime-metadata'

const temporaryDirectories: string[] = []

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })))
})

async function writeExecutable(filePath: string, content: string): Promise<void> {
  await writeFile(filePath, `#!/bin/sh\n${content}\n`)
  await chmod(filePath, 0o755)
}

async function createFixture(): Promise<string> {
  const resourcePath = await mkdtemp(join(tmpdir(), 'aivplayer-runtime-metadata-'))
  temporaryDirectories.push(resourcePath)
  await mkdir(join(resourcePath, 'whisper.cpp'), { recursive: true })
  await mkdir(join(resourcePath, 'ffmpeg'), { recursive: true })
  await mkdir(join(resourcePath, 'heif'), { recursive: true })
  await mkdir(join(resourcePath, 'vision', 'siglip2-base-patch16-224-ONNX', 'onnx'), { recursive: true })
  await writeExecutable(join(resourcePath, 'whisper.cpp', 'whisper-cli'), 'printf whisper')
  await writeExecutable(join(resourcePath, 'ffmpeg', 'ffmpeg'), 'printf "ffmpeg version 8.1.2\\nconfiguration: --enable-gpl --enable-libx264\\n"')
  await writeExecutable(join(resourcePath, 'ffmpeg', 'ffprobe'), 'printf "ffprobe version 8.1.2\\nconfiguration: --enable-gpl --enable-libx264\\n"')
  await writeExecutable(join(resourcePath, 'heif', 'heif-enc'), 'printf "heif-enc 1.23.1\\n"')
  await writeExecutable(join(resourcePath, 'heif', 'heif-convert'), 'printf "heif-convert 1.23.1\\n"')
  for (const relativePath of VISION_MODEL_FILES) {
    const filePath = join(resourcePath, 'vision', 'siglip2-base-patch16-224-ONNX', relativePath)
    await mkdir(join(filePath, '..'), { recursive: true })
    await writeFile(filePath, `model:${relativePath}`)
  }
  return resourcePath
}

describe('writeRuntimeMetadata', () => {
  it('records actual runtime hashes, FFmpeg license profile, and model revision', async () => {
    const resourcePath = await createFixture()
    const metadata = await writeRuntimeMetadata({
      resourcePath,
      platform: 'linux',
      applicationVersion: '0.4.0',
      generatedAt: '2026-08-09T00:00:00.000Z',
      whisperVersion: '1.9.1',
      libheifVersion: '1.23.1',
      libheifEncoder: 'x265'
    })

    expect(metadata.platform).toBe('linux')
    expect(metadata.components.whisperCpp.sourceVersion).toBe('1.9.1')
    expect(metadata.components.whisperCpp.license).toBe('MIT')
    expect(metadata.components.ffmpeg.licenseProfile).toBe('gpl-enabled')
    expect(metadata.components.ffmpeg.configuration).toContain('--enable-gpl')
    expect(metadata.components.libheif.status).toBe('bundled')
    expect(metadata.components.libheif.encoder).toBe('x265')
    expect(metadata.components.siglip2.revision).toBe('ba1f3b0843f24bc5417d38e19c37b287d719b2f4')
    expect(metadata.components.siglip2.files).toHaveLength(VISION_MODEL_FILES.length)

    const whisperPath = join(resourcePath, 'whisper.cpp', 'whisper-cli')
    const expectedHash = createHash('sha256').update(await readFile(whisperPath)).digest('hex')
    expect(metadata.components.whisperCpp.sha256).toBe(expectedHash)
    await expect(readFile(join(resourcePath, 'runtime-metadata.json'), 'utf8')).resolves.toContain('gpl-enabled')
  }, 15000)

  it('blocks nonfree FFmpeg builds before writing metadata', async () => {
    const resourcePath = await createFixture()
    await writeExecutable(join(resourcePath, 'ffmpeg', 'ffmpeg'), 'echo "ffmpeg version 8.1.2"; echo "configuration: --enable-gpl --enable-nonfree"')

    await expect(writeRuntimeMetadata({ resourcePath, platform: 'linux', applicationVersion: '0.4.0' })).rejects.toThrow('--enable-nonfree')
  })

  it('requires all vision model files or a matching remote manifest', async () => {
    const resourcePath = await createFixture()
    await rm(join(resourcePath, 'vision', 'siglip2-base-patch16-224-ONNX', 'onnx', 'vision_model_uint8.onnx'))

    await expect(writeRuntimeMetadata({ resourcePath, platform: 'linux', applicationVersion: '0.4.0' })).rejects.toThrow('vision_model_uint8.onnx')
  })
})
