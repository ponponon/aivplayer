import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const projectRoot = process.cwd()

describe('vision clip collection operation history UI', () => {
  it('loads the summary list through preload and renders status, targets and counts', () => {
    const panel = readFileSync(join(projectRoot, 'src/renderer/src/app/vision-panel.tsx'), 'utf8')
    const preload = readFileSync(join(projectRoot, 'src/preload/index.ts'), 'utf8')
    const styles = readFileSync(join(projectRoot, 'src/renderer/src/styles/player/vision-library-results.css'), 'utf8')

    expect(preload).toContain('listVisionClipCollectionOperationHistory')
    expect(panel).toContain('window.aiv.listVisionClipCollectionOperationHistory()')
    expect(panel).toContain('vision-collection-operation-history')
    expect(panel).toContain('collectionOperationTypeLabel[operation.type]')
    expect(panel).toContain('collectionOperationHistoryStatusLabel[operation.status]')
    expect(panel).toContain('collectionOperationHistoryTargetCount(operation.collectionIds.length)')
    expect(panel).toContain('collectionOperationHistorySelectionCount(operation.selectionCount)')
    expect(styles).toContain('.vision-collection-operation-history-entry.is-active')
    expect(styles).toContain('.vision-collection-operation-history-entry.is-redoable')
    expect(styles).toContain('.vision-collection-operation-history-entry.is-undone')
  })

  it('keeps collection operation history copy complete in every supported locale', () => {
    for (const locale of ['zh-CN', 'en-US', 'ja-JP', 'ko-KR']) {
      const source = readFileSync(join(projectRoot, `src/shared/i18n/locales/${locale}.ts`), 'utf8')
      expect(source).toContain('collectionOperationHistoryTitle')
      expect(source).toContain('collectionOperationHistoryDescription')
      expect(source).toContain('collectionOperationTypeLabel')
      expect(source).toContain('collectionOperationHistoryStatusLabel')
      expect(source).toContain('collectionOperationHistoryTargetCount')
      expect(source).toContain('collectionOperationHistorySelectionCount')
    }
  })
})
