import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const projectRoot = process.cwd()
const readSource = (path: string): string => readFileSync(join(projectRoot, path), 'utf8')

describe('vision similar media wiring', () => {
  it('keeps the scan and cancellation contract connected across IPC and preload', () => {
    const channels = readSource('src/shared/ipc-channels.ts')
    const ipc = readSource('src/desktop/ipc-vision.ts')
    const preload = readSource('src/preload/index.ts')
    const library = readSource('src/core/ai/vision-library.ts')

    expect(channels).toContain('VISION_SIMILAR_MEDIA_SCAN')
    expect(channels).toContain('VISION_SIMILAR_MEDIA_CANCEL')
    expect(ipc).toContain('scanVisionSimilarMediaSources')
    expect(ipc).toContain('listSimilarMediaFrames')
    expect(ipc).toContain('visionSimilarMediaAbortController')
    expect(preload).toContain('scanVisionSimilarMedia')
    expect(preload).toContain('cancelVisionSimilarMedia')
    expect(library).toContain('async listSimilarMediaFrames(sources: readonly VisionLibrarySource[], signal?: AbortSignal)')
    expect(library).toContain('selectVisionSimilarMediaFrames')
  })
})
