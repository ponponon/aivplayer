import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const projectRoot = join(__dirname, '../..')

function readProjectFile(relativePath: string): string {
  return readFileSync(join(projectRoot, relativePath), 'utf8')
}

describe('media import inbox wiring', () => {
  it('keeps the batch orchestration connected across desktop, preload, hook, and view', () => {
    const ipc = readProjectFile('src/desktop/ipc-media-import-inbox.ts')
    const preload = readProjectFile('src/preload/index.ts')
    const hook = readProjectFile('src/renderer/src/app/use-vision-import-inbox.ts')
    const inbox = readProjectFile('src/renderer/src/app/vision-import-inbox.tsx')
    const panel = readProjectFile('src/renderer/src/app/vision-panel.tsx')

    expect(ipc).toContain('MEDIA_IMPORT_INBOX_BATCH_TRANSITION')
    expect(ipc).toContain('getMediaImportInboxProcessor().enqueue')
    expect(preload).toContain('transitionMediaImportInboxBatch')
    expect(hook).toContain('batchQueue')
    expect(hook).toContain('batchRetry')
    expect(hook).toContain("batchClear: (selectedItems: MediaImportInboxItem[]) => transitionBatch(selectedItems, 'clear')")
    expect(inbox).toContain('selectedItemIds')
    expect(inbox).toContain("runBatch('clear')")
    expect(inbox).toContain('inboxBatchClear')
    expect(inbox).toContain('onBatchClear')
    expect(panel).toContain('useVisionImportInbox')
    expect(panel).toContain('<VisionImportInbox')
  })
})
