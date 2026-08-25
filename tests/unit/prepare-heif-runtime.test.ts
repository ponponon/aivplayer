import { chmod, mkdir, mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { prepareHeifRuntime } from '../../scripts/prepare-heif-runtime'

describe('prepare HEIF runtime', () => {
  let temporaryDirectory: string

  beforeEach(async () => {
    temporaryDirectory = await mkdtemp(join(tmpdir(), 'aivplayer-prepare-heif-'))
  })

  afterEach(async () => {
    await rm(temporaryDirectory, { recursive: true, force: true })
  })

  it('makes read-only native sidecars writable for macOS ShipIt updates', async () => {
    const sourceDirectory = join(temporaryDirectory, 'source')
    const resourcePath = join(temporaryDirectory, 'resources')
    const encoderPath = join(sourceDirectory, 'heif-enc')
    const converterPath = join(sourceDirectory, 'heif-convert')
    const sidecarPath = join(sourceDirectory, 'libheif.dylib')

    await mkdir(sourceDirectory, { recursive: true })
    await writeFile(encoderPath, '#!/bin/sh\necho heif-enc\n')
    await writeFile(converterPath, '#!/bin/sh\necho heif-convert\n')
    await writeFile(sidecarPath, 'native sidecar')
    await chmod(encoderPath, 0o755)
    await chmod(converterPath, 0o755)
    await chmod(sidecarPath, 0o444)

    const result = await prepareHeifRuntime({
      resourcePath,
      platform: 'darwin',
      heifDirectory: sourceDirectory
    })

    const stagedSidecarPath = join(resourcePath, 'heif', 'libheif.dylib')
    expect(result.ok).toBe(true)
    await expect(readFile(stagedSidecarPath, 'utf8')).resolves.toBe('native sidecar')
    await expect(stat(stagedSidecarPath).then((value) => value.mode & 0o777)).resolves.toBe(0o644)
    await expect(stat(result.encoderPath).then((value) => value.mode & 0o777)).resolves.toBe(0o755)
  })
})
