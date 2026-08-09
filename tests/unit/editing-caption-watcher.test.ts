import { mkdtemp, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { describe, expect, it } from 'vitest'
import { createEditingCaptionDirectoryWatcher, type EditingCaptionWatchHandle } from '../../src/core/editing/caption-directory-watcher'
import { getEditingCaptionWatchDirectories } from '../../src/shared/editing-caption-watcher'
import { readSource } from './test-source-utils'

describe('editing caption watcher', () => {
  it('derives only parent directories from candidate paths', () => {
    expect(getEditingCaptionWatchDirectories([
      '/media/demo.srt',
      '/media/demo.vtt',
      '/media/other/demo.zh-CN.vtt',
      'demo.translation.vtt',
      '/root.srt'
    ])).toEqual(['/media', '/media/other', '/'])
  })

  it('debounces allowed sidecar changes and ignores unrelated files', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'aivplayer-caption-watcher-'))
    const candidatePath = join(directory, 'demo.zh-CN.vtt')
    const changes: string[][] = []
    let listener: (eventType: string, filename: string | Buffer | null) => void = () => undefined
    const watchHandle: EditingCaptionWatchHandle = {
      close: () => undefined,
      on: () => undefined
    }
    const watcher = createEditingCaptionDirectoryWatcher({
      directories: [directory],
      candidatePaths: [candidatePath],
      debounceMs: 20,
      onChange: (paths) => changes.push([...paths]),
      watchDirectory: (_directory, nextListener) => {
        listener = nextListener
        return watchHandle
      }
    })

    try {
      listener('rename', 'notes.txt')
      await new Promise((resolve) => setTimeout(resolve, 80))
      expect(changes).toEqual([])

      listener('change', 'demo.zh-CN.vtt')
      await new Promise((resolve, reject) => {
        const deadline = setTimeout(() => reject(new Error('Timed out waiting for sidecar watcher')), 2_000)
        const poll = (): void => {
          if (changes.some((paths) => paths.includes(candidatePath))) {
            clearTimeout(deadline)
            resolve(undefined)
            return
          }
          setTimeout(poll, 20)
        }
        poll()
      })
      expect(changes.flat()).toContain(candidatePath)
      watcher.stop()
      listener('change', 'demo.zh-CN.vtt')
      await new Promise((resolve) => setTimeout(resolve, 80))
      expect(changes).toHaveLength(1)
    } finally {
      watcher.stop()
      await rm(directory, { recursive: true, force: true })
    }
  })

  it('exposes the watcher through the desktop IPC and caption effect', () => {
    const channels = readSource('src/shared/ipc-channels.ts')
    const preload = readSource('src/preload/index.ts')
    const desktop = readSource('src/desktop/ipc-editing-caption-watcher.ts')
    const effect = readSource('src/renderer/src/app/use-editing-caption-effect.ts')

    expect(channels).toContain("EDITING_CAPTION_WATCH_START: 'editing:caption-watch-start'")
    expect(channels).toContain("EDITING_CAPTION_FILES_CHANGED: 'editing:caption-files-changed'")
    expect(preload).toContain('startEditingCaptionWatcher')
    expect(preload).toContain('onEditingCaptionFilesChanged')
    expect(desktop).toContain('createEditingCaptionDirectoryWatcher')
    expect(desktop).toContain('candidatePaths: request.candidatePaths')
    expect(effect).toContain('getEditingCaptionWatchDirectories')
    expect(effect).toContain('captionWatchVersion')
    expect(effect).toContain('startEditingCaptionWatcher({ directories, candidatePaths })')
  })
})
