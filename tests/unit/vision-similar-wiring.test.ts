import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const projectRoot = process.cwd()

describe('vision similar search wiring', () => {
  it('keeps the IPC channel, desktop handler, and preload bridge aligned', () => {
    const channels = readFileSync(join(projectRoot, 'src/shared/ipc-channels.ts'), 'utf8')
    const ipc = readFileSync(join(projectRoot, 'src/desktop/ipc-vision.ts'), 'utf8')
    const preload = readFileSync(join(projectRoot, 'src/preload/index.ts'), 'utf8')

    expect(channels).toContain('VISION_SEARCH_SIMILAR')
    expect(ipc).toContain('IPC_CHANNELS.VISION_SEARCH_SIMILAR')
    expect(ipc).toContain('normalizeVisionSimilarSearchRequest')
    expect(ipc).toContain('getVisionLibrary().searchSimilar')
    expect(preload).toContain('searchVisionSimilar')
    expect(preload).toContain('VisionSimilarSearchRequest')
  })
})
