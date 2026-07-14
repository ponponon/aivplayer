import { describe, expect, it } from 'vitest'
import { extractVideoFilePaths, isVideoFilePath, VIDEO_EXTENSIONS } from '../../src/main/media/file-opening'

describe('video file opening', () => {
  it('keeps the supported extensions shared by runtime and packaging', () => {
    expect(VIDEO_EXTENSIONS).toContain('mp4')
    expect(isVideoFilePath('/tmp/movie.MP4')).toBe(true)
    expect(isVideoFilePath('/tmp/subtitles.srt')).toBe(false)
  })

  it('extracts existing video paths from startup and second-instance arguments', () => {
    const existingPaths = new Set(['/videos/one.mp4', '/videos/two.mkv'])

    expect(
      extractVideoFilePaths(
        ['--no-sandbox', '/videos/one.mp4', '/videos/missing.mp4', '/videos/one.mp4', '/videos/two.mkv', '/videos/audio.wav'],
        {
          resolvePath: (value) => value,
          fileExists: (filePath) => existingPaths.has(filePath)
        }
      )
    ).toEqual(['/videos/one.mp4', '/videos/two.mkv'])
  })
})
