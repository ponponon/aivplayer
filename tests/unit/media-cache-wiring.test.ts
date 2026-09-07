import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const projectRoot = join(import.meta.dirname, '..', '..')

describe('media cache IPC wiring', () => {
  it('registers dedicated cache statistics and cleanup channels', () => {
    const channels = readFileSync(join(projectRoot, 'src/shared/ipc-channels.ts'), 'utf8')
    const ipc = readFileSync(join(projectRoot, 'src/desktop/ipc-media-cache.ts'), 'utf8')
    const desktop = readFileSync(join(projectRoot, 'src/desktop/index.ts'), 'utf8')
    expect(channels).toContain("MEDIA_CACHE_STATS: 'media:cache-stats'")
    expect(channels).toContain("MEDIA_CACHE_CLEAR_STALE: 'media:cache-clear-stale'")
    expect(ipc).toContain('getMediaCacheStats(getMediaCacheRoots())')
    expect(ipc).toContain('clearStaleMediaCaches(getMediaCacheRoots())')
    expect(desktop).toContain('registerMediaCacheIpc()')
  })

  it('exposes the dedicated cache API without removing the legacy ASR API', () => {
    const preload = readFileSync(join(projectRoot, 'src/preload/index.ts'), 'utf8')
    expect(preload).toContain('getMediaCacheStats')
    expect(preload).toContain('clearStaleMediaCaches')
    expect(preload).toContain('getAsrCacheStats')
    expect(preload).toContain('clearStaleAsrCache')
  })
})
