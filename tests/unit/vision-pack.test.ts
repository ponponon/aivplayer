import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import {
  VISION_PACK_ID,
  VISION_PACK_VERSION,
  getVisionPackActivePointerPath,
  getVisionPackDirectory,
  getVisionPackManifestPath,
  getVisionPackRootDirectory,
  resolveVisionPackDirectory
} from '../../src/core/ai/vision-pack'

const temporaryDirectories: string[] = []

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })))
})

async function createInstalledPack(userDataPath: string, revision: string): Promise<string> {
  const directory = getVisionPackDirectory(userDataPath, revision)
  await mkdir(directory, { recursive: true })
  await writeFile(join(directory, 'package.json'), '{}\n')
  await writeFile(getVisionPackManifestPath(directory), `${JSON.stringify({
    id: VISION_PACK_ID,
    version: VISION_PACK_VERSION,
    revision,
    platform: process.platform,
    arch: process.arch,
    entry: 'package.json'
  })}\n`)
  return directory
}

async function createUserDataPath(): Promise<string> {
  const directory = await mkdtemp(join(tmpdir(), 'aivplayer-vision-pack-'))
  temporaryDirectories.push(directory)
  return directory
}

describe('vision pack resolution', () => {
  it('does not select an arbitrary old revision without an active pointer', async () => {
    const userDataPath = await createUserDataPath()
    await createInstalledPack(userDataPath, 'a'.repeat(32))

    expect(resolveVisionPackDirectory('', userDataPath)).toBeNull()
  })

  it('selects the revision recorded by the current active pointer', async () => {
    const userDataPath = await createUserDataPath()
    const revision = 'b'.repeat(32)
    const directory = await createInstalledPack(userDataPath, revision)
    await writeFile(getVisionPackActivePointerPath(userDataPath), `${JSON.stringify({
      id: VISION_PACK_ID,
      version: VISION_PACK_VERSION,
      revision,
      platform: process.platform,
      arch: process.arch
    })}\n`)

    expect(resolveVisionPackDirectory('', userDataPath)).toBe(directory)
  })

  it('ignores an active pointer from an older app version', async () => {
    const userDataPath = await createUserDataPath()
    const revision = 'c'.repeat(32)
    await createInstalledPack(userDataPath, revision)
    await mkdir(getVisionPackRootDirectory(userDataPath), { recursive: true })
    await writeFile(getVisionPackActivePointerPath(userDataPath), `${JSON.stringify({
      id: VISION_PACK_ID,
      version: '0.6.2',
      revision,
      platform: process.platform,
      arch: process.arch
    })}\n`)

    expect(resolveVisionPackDirectory('', userDataPath)).toBeNull()
  })
})
