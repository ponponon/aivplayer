import { describe, expect, it } from 'vitest'
import { createMediaImportInboxWatcher } from '../../src/core/media/media-import-inbox-watcher'

describe('media import inbox watcher', () => {
  it('debounces changes and closes injected watchers', async () => {
    let emit: () => void = () => undefined
    let closed = false
    const changed: string[][] = []
    const watcher = createMediaImportInboxWatcher({
      directories: ['/tmp/import-inbox'],
      debounceMs: 5,
      watchDirectory: (_directory, _recursive, listener) => {
        emit = () => listener('change', 'movie.mp4')
        return {
          close: () => { closed = true },
          on: () => undefined
        }
      },
      onChange: (directories) => changed.push([...directories])
    })

    emit()
    emit()
    await new Promise((resolve) => setTimeout(resolve, 20))
    expect(changed).toEqual([['/tmp/import-inbox']])

    watcher.stop()
    expect(closed).toBe(true)
    emit()
    await new Promise((resolve) => setTimeout(resolve, 20))
    expect(changed).toHaveLength(1)
  })
})
