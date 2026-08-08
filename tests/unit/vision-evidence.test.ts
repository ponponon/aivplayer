import { describe, expect, it } from 'vitest'
import { createEditingProjectFromVisionSearchResults, createEditingProjectFromVisionSelections, createVisionClipSelections, createVisionSourceFingerprint, mergeVisionClipSelections, normalizeVisionTimeRange } from '../../src/core/ai/vision-evidence'
import { parseEditingProject } from '../../src/core/editing/project-file'
import type { VisionClipSelection, VisionSearchResult } from '../../src/shared/vision-types'

function result(patch: Partial<VisionSearchResult> = {}): VisionSearchResult {
  return {
    id: 'frame-1',
    videoPath: '/videos/demo.mp4',
    fileName: 'demo.mp4',
    timestampSeconds: 5,
    thumbnailPath: '/cache/demo.jpg',
    score: 0.9,
    matchSource: 'subtitle',
    matchedText: '海边的风很大',
    modelId: 'test-model',
    modelVariant: 'test',
    ...patch
  }
}

describe('vision evidence bridge', () => {
  it('uses one source fingerprint format for index and derived evidence', () => {
    expect(createVisionSourceFingerprint('/videos/demo.mp4', 120, 456.75)).toBe('/videos/demo.mp4:120:456.75')
  })

  it('normalizes invalid and out-of-bounds source ranges', () => {
    expect(normalizeVisionTimeRange({ startSeconds: -2, endSeconds: 4 }, 3)).toEqual({ startSeconds: 0, endSeconds: 3 })
    expect(normalizeVisionTimeRange({ startSeconds: 4, endSeconds: 4 }, 10)).toBeNull()
    expect(normalizeVisionTimeRange({ startSeconds: Number.NaN, endSeconds: 1 }, 10)).toBeNull()
  })

  it('uses exact subtitle cue bounds instead of the nearest thumbnail time', () => {
    const selections = createVisionClipSelections([result({ timestampSeconds: 5, startSeconds: 4.125, endSeconds: 5.875, evidenceId: 'cue-1' })], {
      sourceMetadata: new Map([['/videos/demo.mp4', { id: 'source-demo', fingerprint: '/videos/demo.mp4:12', durationSeconds: 12 }]])
    })

    expect(selections).toHaveLength(1)
    expect(selections[0]).toMatchObject({
      sourceId: 'source-demo',
      startSeconds: 4.125,
      endSeconds: 5.875,
      durationSeconds: 12,
      evidenceIds: ['cue-1']
    })
  })

  it('merges overlapping ranges from one source but keeps different sources separate', () => {
    const selections = createVisionClipSelections([
      result({ id: 'frame-a', evidenceId: 'cue-a', startSeconds: 1, endSeconds: 2, matchedText: '第一句' }),
      result({ id: 'frame-b', evidenceId: 'cue-b', startSeconds: 2.03, endSeconds: 3, matchedText: '第二句' }),
      result({ id: 'frame-c', evidenceId: 'cue-c', videoPath: '/videos/other.mp4', fileName: 'other.mp4', startSeconds: 1, endSeconds: 2 })
    ], { mergeGapSeconds: 0.05 })

    expect(selections).toHaveLength(2)
    expect(selections[0]).toMatchObject({ startSeconds: 1, endSeconds: 3, evidenceIds: ['cue-a', 'cue-b'], text: '第一句\n第二句' })
    expect(selections[1]).toMatchObject({ videoPath: '/videos/other.mp4', startSeconds: 1, endSeconds: 2 })
  })

  it('creates a valid source-anchored editing project with captions', () => {
    const project = createEditingProjectFromVisionSearchResults([
      result({ id: 'frame-a', evidenceId: 'cue-a', startSeconds: 1, endSeconds: 3, matchedText: '第一段' }),
      result({ id: 'frame-b', evidenceId: 'cue-b', startSeconds: 6, endSeconds: 8, matchedText: '第二段' })
    ], {
      projectId: 'project-evidence',
      now: 100,
      sourceMetadata: new Map([['/videos/demo.mp4', { id: 'source-demo', fingerprint: '/videos/demo.mp4:12', durationSeconds: 12, width: 1920, height: 1080 }]])
    })

    expect(project).toMatchObject({ id: 'project-evidence', createdAt: 100, updatedAt: 100, title: '语义选段 · demo.mp4' })
    expect(project.sources).toEqual([expect.objectContaining({ id: 'source-demo', durationSeconds: 12, width: 1920, height: 1080 })])
    expect(project.videoClips.map((clip) => [clip.sourceStartSeconds, clip.sourceEndSeconds])).toEqual([[1, 3], [6, 8]])
    expect(project.captions.map((caption) => [caption.startSeconds, caption.durationSeconds, caption.sourceStartSeconds, caption.sourceEndSeconds])).toEqual([[0, 2, 1, 3], [2, 2, 6, 8]])
    expect(parseEditingProject(project)).toEqual(project)
  })

  it('rebinds persisted selections to the current media source metadata', () => {
    const persistedSelection: VisionClipSelection = {
      sourceId: 'source-vision-old',
      videoPath: '/videos/demo.mp4',
      fileName: 'demo.mp4',
      fingerprint: 'old-fingerprint',
      durationSeconds: 60,
      startSeconds: 58,
      endSeconds: 64,
      evidenceIds: ['evidence-1'],
      evidenceTypes: ['visual']
    }
    const project = createEditingProjectFromVisionSelections([persistedSelection], {
      title: 'Clip Inbox Smoke',
      sourceMetadata: new Map([['/videos/demo.mp4', { id: 'source-current', fingerprint: 'current-fingerprint', durationSeconds: 60, width: 1920, height: 1080 }]])
    })

    expect(project.sources).toEqual([expect.objectContaining({ id: 'source-current', fingerprint: 'current-fingerprint', width: 1920, height: 1080 })])
    expect(project.videoClips).toEqual([expect.objectContaining({ sourceId: 'source-current', sourceStartSeconds: 58, sourceEndSeconds: 60 })])
  })

  it('keeps the direct merge helper deterministic', () => {
    const selections = createVisionClipSelections([result({ startSeconds: 3, endSeconds: 4 }), result({ startSeconds: 1, endSeconds: 2 })])
    expect(mergeVisionClipSelections(selections).map((selection) => selection.startSeconds)).toEqual([1, 3])
  })
})
