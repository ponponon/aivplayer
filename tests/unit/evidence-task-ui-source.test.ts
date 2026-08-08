import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const projectRoot = process.cwd()
const readSource = (path: string): string => readFileSync(join(projectRoot, path), 'utf8')

describe('evidence task renderer contract', () => {
  it('keeps TTS drafts separate until an explicit formal subtitle import', () => {
    const task = readSource('src/renderer/src/app/vision-tts-task.tsx')
    const drafts = readSource('src/renderer/src/app/vision-tts-drafts.ts')
    const list = readSource('src/renderer/src/app/vision-tts-draft-list.tsx')
    const panel = readSource('src/renderer/src/app/vision-panel.tsx')

    expect(task).toContain('useVisionTtsDrafts')
    expect(task).toContain('vision-tts-save-draft-button')
    expect(task).toContain('VisionTtsDraftList')
    expect(drafts).toContain('listMediaEvidenceDrafts')
    expect(drafts).toContain('deleteMediaEvidenceDraft')
    expect(drafts).toContain('importMediaEvidenceDraft')
    expect(list).toContain('vision-tts-confirm-import-button')
    expect(list).toContain('ttsDraftOverwriteDescription')
    expect(panel).toContain('onSubtitleImported={handleImportedSubtitle}')
    expect(panel).toContain('setActiveSubtitle(subtitleResult)')
    expect(panel).toContain('setSubtitleResult(subtitleResult)')
  })
})
