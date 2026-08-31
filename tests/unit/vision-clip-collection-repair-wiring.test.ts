import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const projectRoot = process.cwd()

describe('vision clip collection repair wiring', () => {
  it('keeps batch repair behind a preview, batch IPC, and one content history update', () => {
    const channel = readFileSync(join(projectRoot, 'src/shared/ipc-channels.ts'), 'utf8')
    const desktop = readFileSync(join(projectRoot, 'src/desktop/ipc-vision.ts'), 'utf8')
    const preload = readFileSync(join(projectRoot, 'src/preload/index.ts'), 'utf8')
    const panel = readFileSync(join(projectRoot, 'src/renderer/src/app/vision-panel.tsx'), 'utf8')
    const repair = readFileSync(join(projectRoot, 'src/core/ai/clip-inbox-collection-repair.ts'), 'utf8')

    expect(channel).toContain("VISION_CLIP_COLLECTION_BATCH_CONTENT_UPDATE: 'vision:clip-collection-batch-content-update'")
    expect(desktop).toContain('IPC_CHANNELS.VISION_CLIP_COLLECTION_BATCH_CONTENT_UPDATE')
    expect(desktop).toContain('updateCollectionsSelections(request.updates)')
    expect(preload).toContain('updateVisionClipCollectionsSelections')
    expect(preload).toContain('IPC_CHANNELS.VISION_CLIP_COLLECTION_BATCH_CONTENT_UPDATE')
    expect(repair).toContain('createVisionClipCollectionRepairPlan')
    expect(panel).toContain('prepareSelectedCollectionRepair')
    expect(panel).toContain('collectionRepairBatchPreview')
    expect(panel).toContain('applySelectedCollectionRepair')
    expect(panel).toContain('updateVisionClipCollectionsSelections({ updates })')
    expect(panel).toContain('setCollectionRepairPreview(null)')
  })

  it('provides the batch repair copy in every supported locale', () => {
    for (const locale of ['zh-CN', 'en-US', 'ja-JP', 'ko-KR']) {
      const source = readFileSync(join(projectRoot, `src/shared/i18n/locales/${locale}.ts`), 'utf8')
      expect(source).toContain('collectionRepairBatchAction')
      expect(source).toContain('collectionRepairBatchPreviewDescription')
      expect(source).toContain('collectionRepairBatchNeedComplete')
    }
  })
})
