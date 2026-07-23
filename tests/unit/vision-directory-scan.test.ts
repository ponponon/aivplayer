import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { scanVisionDirectory } from '../../src/main/ai/vision-directory-scan'

const temporaryDirectories: string[] = []

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })))
})

describe('vision directory scan', () => {
  it('finds supported videos recursively and reports progress', async () => {
    const root = await mkdtemp(join(tmpdir(), 'aivplayer-vision-scan.'))
    temporaryDirectories.push(root)
    const nested = join(root, 'nested')
    await mkdir(nested)
    await writeFile(join(root, 'root.mp4'), '')
    await writeFile(join(nested, 'nested.mkv'), '')
    await writeFile(join(root, 'notes.txt'), '')
    const progress: number[] = []

    const result = await scanVisionDirectory(root, true, new AbortController().signal, (next) => {
      progress.push(next.discoveredVideos)
    })

    expect(result.files).toEqual([join(root, 'nested', 'nested.mkv'), join(root, 'root.mp4')])
    expect(result.scannedDirectories).toBe(2)
    expect(progress.at(-1)).toBe(2)
  })

  it('does not descend into subfolders when recursive scanning is disabled', async () => {
    const root = await mkdtemp(join(tmpdir(), 'aivplayer-vision-scan.'))
    temporaryDirectories.push(root)
    const nested = join(root, 'nested')
    await mkdir(nested)
    await writeFile(join(root, 'root.mov'), '')
    await writeFile(join(nested, 'nested.webm'), '')

    const result = await scanVisionDirectory(root, false, new AbortController().signal, () => undefined)

    expect(result.files).toEqual([join(root, 'root.mov')])
    expect(result.scannedDirectories).toBe(1)
  })
})
