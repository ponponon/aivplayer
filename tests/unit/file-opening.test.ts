import { describe, expect, it } from 'vitest'
import { extractVideoFilePaths, isMediaFileAvailable, isVideoFilePath, mergeMediaFiles, VIDEO_EXTENSIONS } from '../../src/main/media/file-opening'

describe('video file opening', () => {
  it('keeps the supported extensions shared by runtime and packaging', () => {
    expect(VIDEO_EXTENSIONS).toContain('mp4')
    expect(isVideoFilePath('/tmp/movie.MP4')).toBe(true)
    expect(isVideoFilePath('/tmp/subtitles.srt')).toBe(false)
  })

  it('reports missing or unsupported history files as unavailable', () => {
    expect(isMediaFileAvailable('/videos/missing.mp4')).toBe(false)
    expect(isMediaFileAvailable('/videos/subtitles.srt')).toBe(false)
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

  it('remembers files delivered after the first window load without duplicating the playlist', () => {
    const firstFile = { id: 'one', name: 'one.mp4', path: '/videos/one.mp4', url: 'aiv-media://file/one', extension: 'mp4' }
    const secondFile = { id: 'two', name: 'two.mp4', path: '/videos/two.mp4', url: 'aiv-media://file/two', extension: 'mp4' }
    const duplicateWithNewId = { ...firstFile, id: 'one-new', url: 'aiv-media://file/one-new' }

    expect(mergeMediaFiles([firstFile], [duplicateWithNewId, secondFile])).toEqual([firstFile, secondFile])
  })
})
