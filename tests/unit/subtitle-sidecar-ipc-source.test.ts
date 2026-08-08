import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const projectRoot = process.cwd()
const readSource = (path: string): string => readFileSync(join(projectRoot, path), 'utf8')

describe('subtitle sidecar restoration contract', () => {
  it('keeps sidecar restoration scoped to the current media and cache fallback', () => {
    const channels = readSource('src/shared/ipc-channels.ts')
    const types = readSource('src/shared/asr-types.ts')
    const preload = readSource('src/preload/index.ts')
    const ipc = readSource('src/desktop/ipc-asr-subtitles.ts')
    const effects = readSource('src/renderer/src/app/use-subtitle-cache-effects.ts')
    const draftIpc = readSource('src/desktop/ipc-evidence-draft.ts')

    expect(channels).toContain("ASR_RESOLVE_MEDIA_SUBTITLE_SIDECAR: 'asr:resolve-media-subtitle-sidecar'")
    expect(types).toContain('AsrSubtitleSidecarRequest')
    expect(preload).toContain('resolveMediaSubtitleSidecar')
    expect(ipc).toContain('resolveMediaSubtitleSidecar')
    expect(ipc).toContain('subtitleSidecarLoaded')
    expect(effects).toContain('window.aiv.resolveMediaSubtitleSidecar')
    expect(effects).toContain('window.aiv.resolveAsrSubtitleCache')
    expect(effects).toContain('if (sidecar?.success && sidecar.subtitleUrl)')
    expect(draftIpc).toContain('getMediaSubtitleSidecarPaths')
  })
})
