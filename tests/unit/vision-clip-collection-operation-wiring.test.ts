import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const projectRoot = process.cwd()

describe('vision clip collection operation wiring', () => {
  it('keeps collection updates and undo/redo behind shared IPC, desktop and preload', () => {
    const channels = readFileSync(join(projectRoot, 'src/shared/ipc-channels.ts'), 'utf8')
    const desktop = readFileSync(join(projectRoot, 'src/desktop/ipc-vision.ts'), 'utf8')
    const preload = readFileSync(join(projectRoot, 'src/preload/index.ts'), 'utf8')
    const store = readFileSync(join(projectRoot, 'src/core/ai/clip-inbox-store.ts'), 'utf8')

    expect(channels).toContain("VISION_CLIP_COLLECTION_FLAGS_UPDATE: 'vision:clip-collection-flags-update'")
    expect(channels).toContain("VISION_CLIP_COLLECTION_OPERATION_HISTORY: 'vision:clip-collection-operation-history'")
    expect(channels).toContain("VISION_CLIP_COLLECTION_OPERATION_REDO_HISTORY: 'vision:clip-collection-operation-redo-history'")
    expect(channels).toContain("VISION_CLIP_COLLECTION_OPERATION_UNDO: 'vision:clip-collection-operation-undo'")
    expect(channels).toContain("VISION_CLIP_COLLECTION_OPERATION_REDO: 'vision:clip-collection-operation-redo'")
    expect(desktop).toContain('IPC_CHANNELS.VISION_CLIP_COLLECTION_FLAGS_UPDATE')
    expect(desktop).toContain('getClipInboxStore().updateCollectionFlags')
    expect(desktop).toContain('IPC_CHANNELS.VISION_CLIP_COLLECTION_OPERATION_HISTORY')
    expect(desktop).toContain('getClipInboxStore().getLastCollectionOperation()')
    expect(desktop).toContain('IPC_CHANNELS.VISION_CLIP_COLLECTION_OPERATION_REDO_HISTORY')
    expect(desktop).toContain('getClipInboxStore().getLastCollectionRedoOperation()')
    expect(desktop).toContain('IPC_CHANNELS.VISION_CLIP_COLLECTION_OPERATION_UNDO')
    expect(desktop).toContain('getClipInboxStore().undoLastCollectionOperation()')
    expect(desktop).toContain('IPC_CHANNELS.VISION_CLIP_COLLECTION_OPERATION_REDO')
    expect(desktop).toContain('getClipInboxStore().redoLastCollectionOperation()')
    expect(preload).toContain('updateVisionClipCollectionFlags')
    expect(preload).toContain('IPC_CHANNELS.VISION_CLIP_COLLECTION_FLAGS_UPDATE')
    expect(preload).toContain('getVisionClipCollectionOperationHistory')
    expect(preload).toContain('getVisionClipCollectionOperationRedoHistory')
    expect(preload).toContain('undoVisionClipCollectionOperation')
    expect(preload).toContain('redoVisionClipCollectionOperation')
    expect(preload).toContain('IPC_CHANNELS.VISION_CLIP_COLLECTION_OPERATION_REDO')
    expect(store).toContain('CREATE TABLE IF NOT EXISTS clip_collection_operation_history')
    expect(store).toContain('updateCollectionFlags(request: VisionClipCollectionFlagUpdateRequest)')
    expect(store).toContain('recordCollectionOperation(\'flags\'')
    expect(store).toContain('recordCollectionOperation(\'merge\'')
    expect(store).toContain('undoLastCollectionOperation()')
    expect(store).toContain('getLastCollectionRedoOperation()')
    expect(store).toContain('redoLastCollectionOperation()')
  })
})
