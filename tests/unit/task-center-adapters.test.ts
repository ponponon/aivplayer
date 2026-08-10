import { describe, expect, it } from 'vitest'
import { createHash } from 'node:crypto'
import { createAsrTaskCenterEvent, createBatchSubtitleTaskCenterEvent, createDramaGenerationTaskCenterEvent, createDramaTaskCenterEvent, createEvidenceTaskCenterEvent, createMediaImportTaskCenterEvent, createVisionTaskCenterEvent } from '../../src/core/tasks/task-center-adapters'
import type { AsrJobProgress, BatchSubtitleJob } from '../../src/shared/media-types'
import type { DramaGenerationTask, DramaProgress } from '../../src/shared/drama-types'
import type { MediaEvidenceTask } from '../../src/shared/evidence-task-types'
import type { MediaImportInboxPipelineProgress } from '../../src/shared/media-import-inbox'
import type { VisionIndexProgress } from '../../src/shared/vision-types'

const baseVision: VisionIndexProgress = {
  status: 'indexing', stage: 'frames', totalVideos: 2, currentVideoIndex: 1, totalFrames: 10, processedFrames: 4, skippedVideos: 0, captionOnlyVideos: 0, currentVideoPath: '/media/demo.mp4', message: '正在抽帧'
}

describe('task center adapters', () => {
  it('normalizes ASR progress that is already represented as 0..1', () => {
    const event = createAsrTaskCenterEvent({ stage: 'transcribing', percent: 0.42, message: '识别中', mediaPath: '/media/demo.mp4' }, 10)
    const key = createHash('sha256').update('/media/demo.mp4').digest('hex').slice(0, 16)
    expect(event).toMatchObject({ id: `asr:${key}`, status: 'running', progress: 0.42, current: 'demo.mp4', updatedAt: 10 })
    expect(event.id).not.toContain('/media/demo.mp4')
  })

  it('maps vision, inbox and batch terminal states', () => {
    expect(createVisionTaskCenterEvent({ ...baseVision, status: 'completed', stage: 'completed', currentVideoIndex: 2, processedFrames: 10 }, 11)).toMatchObject({ kind: 'vision-index', status: 'completed', progress: 1 })
    expect(createVisionTaskCenterEvent({ ...baseVision, stage: 'scene-evidence', sceneEvidenceTotal: 4, sceneEvidenceProcessed: 2 }, 11)).toMatchObject({ kind: 'vision-index', status: 'running', progress: 0.5 })
    expect(createVisionTaskCenterEvent({ ...baseVision, stage: 'entity-evidence', entityEvidenceTotal: 4, entityEvidenceProcessed: 3 }, 11)).toMatchObject({ kind: 'vision-index', status: 'running', progress: 0.75 })
    expect(createVisionTaskCenterEvent({ ...baseVision, stage: 'object-evidence', objectEvidenceTotal: 4, objectEvidenceProcessed: 1 }, 11)).toMatchObject({ kind: 'vision-index', status: 'running', progress: 0.25 })
    const inbox: MediaImportInboxPipelineProgress = { itemId: 'item-1', stage: 'vision', status: 'ready', progress: { ...baseVision, status: 'completed', stage: 'completed', processedFrames: 10 }, message: '视觉索引完成' }
    expect(createMediaImportTaskCenterEvent(inbox, { fileName: 'demo.mp4' }, 12)).toMatchObject({ id: 'media-import:item-1', status: 'completed', progress: 1, current: 'demo.mp4' })
    const job = { id: 'batch-1', status: 'paused', message: '已暂停', currentItemId: null, items: [], summary: { total: 0, queued: 0, processing: 0, completed: 0, failed: 0, cancelled: 0 } } as unknown as BatchSubtitleJob
    expect(createBatchSubtitleTaskCenterEvent(job, 13)).toMatchObject({ id: 'batch-subtitle:batch-1', status: 'paused', progress: null })
  })

  it('maps evidence and drama tasks without exposing full paths', () => {
    const evidence = { id: 'evidence-1', kind: 'ocr', mediaPath: '/private/secret/demo.mp4', status: 'running', progress: 0.5, updatedAt: 14, error: undefined, persistenceMessage: undefined } as unknown as MediaEvidenceTask
    expect(createEvidenceTaskCenterEvent(evidence)).toMatchObject({ kind: 'evidence', status: 'running', progress: 0.5, current: 'demo.mp4' })
    const drama: DramaProgress = { stage: 'script', current: 2, total: 2, message: '脚本完成' }
    expect(createDramaTaskCenterEvent(drama, 15)).toMatchObject({ kind: 'drama', status: 'completed', progress: 1 })
    const generation = { id: 'generation-1', mediaType: 'video', status: 'failed', progress: 0.25, message: '失败', error: 'provider error', updatedAt: 16, targetId: 'scene-1' } as unknown as DramaGenerationTask
    expect(createDramaGenerationTaskCenterEvent(generation)).toMatchObject({ kind: 'drama-generation', status: 'failed', message: 'provider error', progress: 0.25 })
  })
})
