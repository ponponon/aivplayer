import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const projectRoot = process.cwd()

describe('vision clip collection batch merge UI wiring', () => {
  it('exposes a guarded action that keeps the source collections', () => {
    const panel = readFileSync(join(projectRoot, 'src/renderer/src/app/vision-panel.tsx'), 'utf8')
    const styles = readFileSync(join(projectRoot, 'src/renderer/src/styles/player/vision-library-results.css'), 'utf8')

    expect(panel).toContain('isMergingCollections')
    expect(panel).toContain('mergeSelectedCollections')
    expect(panel).toContain('selectedCollectionIds.size < 2')
    expect(panel).toContain('collectionsMergeConfirm')
    expect(panel).toContain('window.aiv.mergeVisionClipCollections({ collectionIds')
    expect(panel).toContain('collectionMergeDefaultTitle')
    expect(panel).toContain('collectionMergeDescription')
    expect(panel).toContain('collectionMergeTitle')
    expect(panel).toContain('collectionMergePreview')
    expect(panel).toContain('collectionMergePreviewSources')
    expect(panel).toContain('collectionMergePreviewOutputTitle')
    expect(panel).toContain('collectionMergePreviewTags')
    expect(panel).toContain('collectionMergePreviewUnavailable')
    expect(panel).toContain('collectionMergePreviewSelected')
    expect(panel).toContain('collectionMergePreviewSelectionAriaLabel')
    expect(panel).toContain('excludedCollectionMergeSelectionKeys')
    expect(panel).toContain('selectedSelections: collectionMergeSelectedSelections')
    expect(panel).toContain('toggleCollectionMergeSelection')
    expect(panel).toContain('formatClipPreviewRange')
    expect(panel).toContain('collectionsMerged')
    expect(styles).toContain('.vision-collection-batch-merge')
    expect(styles).toContain('.vision-collection-merge-title-input')
    expect(styles).toContain('.vision-collection-merge-preview')
    expect(styles).toContain('.vision-collection-merge-preview-source-ranges')
    expect(styles).toContain('.vision-collection-merge-preview-selection')
    expect(styles).toContain('.vision-collection-merge-preview-output-ranges')
  })
})
