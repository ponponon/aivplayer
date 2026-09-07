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
    const panel = readSource('src/renderer/src/app/vision-panel.tsx')
    const sources = readSource('src/renderer/src/app/vision-library-sources.tsx')
    const styles = readSource('src/renderer/src/styles/player/vision-library-duplicates.css')

    expect(channels).toContain('VISION_SIMILAR_MEDIA_SCAN')
    expect(channels).toContain('VISION_SIMILAR_MEDIA_CANCEL')
    expect(ipc).toContain('scanVisionSimilarMediaSources')
    expect(ipc).toContain('listSimilarMediaFrames')
    expect(ipc).toContain('visionSimilarMediaAbortController')
    expect(preload).toContain('scanVisionSimilarMedia')
    expect(preload).toContain('cancelVisionSimilarMedia')
    expect(library).toContain('async listSimilarMediaFrames(sources: readonly VisionLibrarySource[], signal?: AbortSignal)')
    expect(library).toContain('selectVisionSimilarMediaFrames')
    expect(panel).toContain('window.aiv.scanVisionSimilarMedia()')
    expect(panel).toContain('similarThumbnailUrls')
    expect(sources).toContain('data-testid="vision-similar-scan"')
    expect(sources).toContain('data-testid="vision-similar-report"')
    expect(sources).toContain('onOpenSource(match.source)')
    expect(styles).toContain('.vision-library-similar-report')
  })
})
