import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const projectRoot = process.cwd()

describe('vision clip collection batch rename UI wiring', () => {
  it('keeps the preview bounded and the action disabled without a rule', () => {
    const panel = readFileSync(join(projectRoot, 'src/renderer/src/app/vision-panel.tsx'), 'utf8')
    const styles = readFileSync(join(projectRoot, 'src/renderer/src/styles/player/vision-library-results.css'), 'utf8')

    expect(panel).toContain('renamePreviewCollections.slice(0, 3)')
    expect(panel).toContain('disabled={isCollectionBatchBusy || !hasRenameRule}')
    expect(styles).toContain('.vision-collection-rename-preview')
    expect(styles).toContain('text-overflow: ellipsis')
  })
})
