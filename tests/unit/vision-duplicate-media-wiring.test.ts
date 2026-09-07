import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const projectRoot = process.cwd()
const readSource = (path: string): string => readFileSync(join(projectRoot, path), 'utf8')

describe('vision duplicate media wiring', () => {
  it('keeps the scan contract connected across IPC, preload, panel, and source card', () => {
    const channels = readSource('src/shared/ipc-channels.ts')
    const ipc = readSource('src/desktop/ipc-vision.ts')
    const preload = readSource('src/preload/index.ts')
    const panel = readSource('src/renderer/src/app/vision-panel.tsx')
    const sources = readSource('src/renderer/src/app/vision-library-sources.tsx')
    const styles = readSource('src/renderer/src/styles/player/vision-library-duplicates.css')
    const playerStyles = readSource('src/renderer/src/styles/player.css')

    expect(channels).toContain('VISION_DUPLICATE_MEDIA_SCAN')
    expect(ipc).toContain('scanVisionDuplicateMediaSources')
    expect(ipc).toContain('createMediaContentHash(source.videoPath)')
    expect(preload).toContain('scanVisionDuplicateMedia')
    expect(panel).toContain('duplicateScan')
    expect(panel).toContain('window.aiv.scanVisionDuplicateMedia()')
    expect(sources).toContain('data-testid="vision-duplicate-scan"')
    expect(sources).toContain('data-testid="vision-duplicate-report"')
    expect(sources).toContain('onOpenSource(source)')
    expect(playerStyles).toContain("@import './player/vision-library-duplicates.css';")
    expect(styles).toContain('.vision-library-duplicate-group')
  })
})
