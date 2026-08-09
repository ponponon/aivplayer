import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { describe, expect, it } from 'vitest'
import { scanMediaImportInbox } from '../../src/core/media/media-import-inbox-scan'

describe('media import inbox scan', () => {
  it('recursively discovers supported media and skips temporary or hidden files', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'aivplayer-media-inbox-scan-'))
    try {
      const nested = join(directory, 'nested')
      await mkdir(nested)
      await writeFile(join(directory, 'movie.mp4'), 'video')
      await writeFile(join(nested, 'episode.webm'), 'video')
      await writeFile(join(directory, 'movie.mp4.part'), 'partial')
      await writeFile(join(directory, '.hidden.mp4'), 'hidden')
      await writeFile(join(directory, 'notes.txt'), 'text')
      const progress: string[] = []

      const result = await scanMediaImportInbox({
        directories: [directory],
        recursive: true,
        signal: new AbortController().signal,
        onProgress: (next) => progress.push(next.status)
      })

      expect(result.files.map((file) => file.fileName)).toEqual(['movie.mp4', 'episode.webm'])
      expect(result.directoriesScanned).toBe(2)
      expect(result.discoveredVideos).toBe(2)
      expect(result.truncated).toBe(false)
      expect(progress.at(-1)).toBe('completed')
    } finally {
      await rm(directory, { recursive: true, force: true })
    }
  })
})
