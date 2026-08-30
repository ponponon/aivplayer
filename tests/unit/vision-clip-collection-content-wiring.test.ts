import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const projectRoot = process.cwd()

describe('vision clip collection content wiring', () => {
  it('keeps single collection content edits behind the dedicated IPC and history path', () => {
    const channels = readFileSync(join(projectRoot, 'src/shared/ipc-channels.ts'), 'utf8')
    const desktop = readFileSync(join(projectRoot, 'src/desktop/ipc-vision.ts'), 'utf8')
    const preload = readFileSync(join(projectRoot, 'src/preload/index.ts'), 'utf8')
    const panel = readFileSync(join(projectRoot, 'src/renderer/src/app/vision-panel.tsx'), 'utf8')

    expect(channels).toContain("VISION_CLIP_COLLECTION_CONTENT_UPDATE: 'vision:clip-collection-content-update'")
    expect(desktop).toContain('IPC_CHANNELS.VISION_CLIP_COLLECTION_CONTENT_UPDATE')
    expect(desktop).toContain('updateCollectionSelections(request.collectionId, request.selections)')
    expect(preload).toContain('updateVisionClipCollectionSelections')
    expect(preload).toContain('IPC_CHANNELS.VISION_CLIP_COLLECTION_CONTENT_UPDATE')

    const start = panel.indexOf('const updateCollectionSelections = async')
    const end = panel.indexOf('  const beginCollectionTitleEdit', start)
    expect(start).toBeGreaterThanOrEqual(0)
    expect(end).toBeGreaterThan(start)
    const helper = panel.slice(start, end)
    expect(helper).toContain('window.aiv.updateVisionClipCollectionSelections')
    expect(helper).toContain('refreshCollectionOperation()')
    expect(helper).toContain('setCollectionTransferStatus(result.message)')
    expect(panel).toContain('void updateCollectionSelections(collection, mergeVisionCollectionSelections(collection.selections))')
    expect(panel).toContain('void updateCollectionSelections(collection, selections)')
    expect(panel).toContain('await updateCollectionSelections(collection, repairedSelections)')
  })

  it('describes content edits in every supported locale', () => {
    for (const locale of ['zh-CN', 'en-US', 'ja-JP', 'ko-KR']) {
      const source = readFileSync(join(projectRoot, `src/shared/i18n/locales/${locale}.ts`), 'utf8')
      expect(source).toContain('collectionContentUpdated')
      expect(source).toContain('collectionContentUpdateUnavailable')
      expect(source).toContain('collectionOperationUndoDescription')
      expect(source).toContain('collectionOperationRedoDescription')
    }
  })
})
