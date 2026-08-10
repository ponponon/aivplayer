import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const projectRoot = process.cwd()
const readSource = (path: string): string => readFileSync(join(projectRoot, path), 'utf8')

describe('visual sync integration', () => {
  it('keeps the selected-caption sync control on the existing undoable caption actions', () => {
    const timeline = readSource('src/renderer/src/app/editing-timeline.tsx')
    const control = readSource('src/renderer/src/app/editing-caption-sync-control.tsx')
    const captionActions = readSource('src/renderer/src/app/editing-caption-actions.ts')
    const styles = readSource('src/renderer/src/styles/player.css')
    expect(timeline).toContain('selectedCaption')
    expect(timeline).toContain('<EditingCaptionSyncControl')
    expect(control).toContain('data-testid="editing-caption-sync"')
    expect(control).toContain('data-testid="editing-caption-sync-right"')
    expect(control).toContain('onResize(caption.id, currentTime, endSeconds)')
    expect(control).toContain('data-testid="editing-caption-multi-sync"')
    expect(control).toContain('data-testid="editing-caption-sync-apply-multi"')
    expect(timeline).toContain('selectedCaptions')
    expect(timeline).toContain('onSync={app.syncEditingCaptions}')
    expect(captionActions).toContain('model.setEditingPast')
    expect(captionActions).toContain('saveEditingProject(nextProject)')
    expect(styles).toContain("./player/editing-timeline-sync.css")
  })
})
