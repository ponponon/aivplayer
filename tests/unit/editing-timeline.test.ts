import { describe, expect, it } from 'vitest'
import type { EditingCaption, EditingGraphic, EditingVideoClip } from '../../src/shared/editing-types'
import { createEditingProject } from '../../src/core/editing/project'
import {
  editedDurationSeconds,
  editedTimeToSource,
  getVideoClipSpans,
  removeEditedInterval,
  sourceRangeToEditedRanges,
  sourceTimeToEdited
} from '../../src/core/editing/timeline-math'
import {
  deleteVideoClipAtEdited,
  deleteVideoClipsById,
  insertVideoClipsAtEdited,
  removeEditedVideoRanges,
  removeEditedVideoRange,
  removeSourceVideoRanges,
  replaceVideoClipSource,
  restoreSourceVideoRange,
  reorderVideoClips,
  splitVideoClipAtEdited,
  trimVideoClipBoundaryAtEdited,
  trimVideoClipLeftAtEdited,
  trimVideoClipRightAtEdited
} from '../../src/core/editing/timeline-operations'
import { reorderEditingCaptions, withUpdatedTimelineRanges } from '../../src/renderer/src/app/editing-action-helpers'
import { snapEditedTime } from '../../src/core/editing/timeline-snapping'

const clip = (id: string, start: number, end: number, sourceId = 'main'): EditingVideoClip => ({
  id,
  sourceId,
  sourceStartSeconds: start,
  sourceEndSeconds: end
})

describe('editing project model', () => {
  it('creates a project with a complete first clip and stable metadata', () => {
    const project = createEditingProject(
      { id: 'source-1', path: '/videos/demo.mp4', name: 'demo.mp4', fingerprint: 'demo:10:20', durationSeconds: 10 },
      { projectId: 'project-1', clipId: 'clip-1', now: 123, title: '  Demo  ' }
    )

    expect(project).toMatchObject({
      schemaVersion: 1,
      id: 'project-1',
      title: 'Demo',
      createdAt: 123,
      updatedAt: 123
    })
    expect(project.videoClips).toEqual([clip('clip-1', 0, 10, 'source-1')])
    expect(project.captions).toEqual([])
  })
})

describe('editing timeline mapping', () => {
  const clips = [clip('a', 0, 4), clip('b', 10, 13), clip('c', 20, 25)]

  it('joins surviving source ranges into edited spans', () => {
    expect(editedDurationSeconds(clips)).toBe(12)
    expect(getVideoClipSpans(clips).map((span) => [span.editedStartSeconds, span.editedEndSeconds])).toEqual([
      [0, 4],
      [4, 7],
      [7, 12]
    ])
  })

  it('maps edited time to source time and keeps the preceding clip at a seam', () => {
    expect(editedTimeToSource(clips, 5)).toMatchObject({ index: 1, sourceSeconds: 11 })
    expect(editedTimeToSource(clips, 4)).toMatchObject({ index: 0, sourceSeconds: 4 })
    expect(editedTimeToSource(clips, 99)).toMatchObject({ index: 2, sourceSeconds: 25 })
  })

  it('returns null for source time that was cut out', () => {
    expect(sourceTimeToEdited(clips, 'main', 11)).toBe(5)
    expect(sourceTimeToEdited(clips, 'main', 7)).toBeNull()
    expect(sourceRangeToEditedRanges(clips, 'main', 3, 22)).toEqual([
      { startSeconds: 3, endSeconds: 4 },
      { startSeconds: 4, endSeconds: 7 },
      { startSeconds: 7, endSeconds: 9 }
    ])
  })

  it('snaps pointer time to nearby cuts, playhead points, and whole seconds', () => {
    expect(snapEditedTime(3.06, 20, [4])).toBe(3)
    expect(snapEditedTime(3.93, 20, [4])).toBe(4)
    expect(snapEditedTime(7.94, 20, [7.9])).toBe(7.9)
    expect(snapEditedTime(7.7, 20, [7.9])).toBe(7.7)
  })

  it('keeps overlay starts inside their own available range while snapping', () => {
    // The track passes duration - item duration as the effective upper bound,
    // so a nearby end-of-timeline snap cannot push the item past the canvas.
    expect(snapEditedTime(9.94, 9.5, [10])).toBe(9.5)
    expect(snapEditedTime(4.03, 9.5, [4])).toBe(4)
  })
})

describe('editing timeline operations', () => {
  const createRight = (base: EditingVideoClip, start: number, end: number): EditingVideoClip => ({
    ...base,
    id: `${base.id}-right`,
    sourceStartSeconds: start,
    sourceEndSeconds: end
  })

  it('splits a clip without changing the final duration', () => {
    const result = splitVideoClipAtEdited([clip('a', 0, 10)], 4, createRight)
    expect(result.removedRange).toBeNull()
    expect(result.clips.map((item) => [item.id, item.sourceStartSeconds, item.sourceEndSeconds])).toEqual([
      ['a', 0, 4],
      ['a-right', 4, 10]
    ])
    expect(editedDurationSeconds(result.clips)).toBe(10)
  })

  it('reorders clips with splice semantics and keeps clip objects intact', () => {
    const clips = [clip('a', 0, 4), clip('b', 10, 13), clip('c', 20, 25)]
    expect(reorderVideoClips(clips, 0, 2).map((item) => item.id)).toEqual(['b', 'c', 'a'])
    expect(reorderVideoClips(clips, 2, 0).map((item) => item.id)).toEqual(['c', 'a', 'b'])
    expect(reorderVideoClips(clips, 1, 1)).toEqual(clips)
  })

  it('inserts a source clip at a boundary or by splitting the hit clip', () => {
    const initial = [clip('a', 0, 10)]
    const inserted = clip('new', 0, 3, 'secondary')
    expect(insertVideoClipsAtEdited(initial, [inserted], 4, (base, start, end) => ({ ...base, id: 'right', sourceStartSeconds: start, sourceEndSeconds: end }))).toMatchObject({
      clips: [clip('a', 0, 4), inserted, { id: 'right', sourceStartSeconds: 4, sourceEndSeconds: 10 }],
      insertedClipIds: ['new'],
      editedInsertSeconds: 4
    })
    expect(insertVideoClipsAtEdited(initial, [inserted], 10).clips.map((item) => item.id)).toEqual(['a', 'new'])
  })

  it('appends multiple source clips as one ordered insertion batch', () => {
    const initial = [clip('main', 0, 4)]
    const inserted = [clip('broll-a', 0, 2, 'a'), clip('broll-b', 3, 6, 'b')]
    const result = insertVideoClipsAtEdited(initial, inserted, editedDurationSeconds(initial))
    expect(result.clips.map((item) => item.id)).toEqual(['main', 'broll-a', 'broll-b'])
    expect(result.insertedClipIds).toEqual(['broll-a', 'broll-b'])
    expect(editedDurationSeconds(result.clips)).toBe(9)
  })

  it('replaces a clip source without changing its edited duration or treatments', () => {
    const initial = [{ ...clip('a', 2, 6), treatment: 'punch-in' as const, treatmentScale: 1.5 }]
    const result = replaceVideoClipSource(initial, 'a', 'replacement', 12)
    expect(result.replaced).toBe(true)
    expect(result.clips[0]).toMatchObject({ id: 'a', sourceId: 'replacement', sourceStartSeconds: 0, sourceEndSeconds: 4, treatment: 'punch-in', treatmentScale: 1.5 })
    expect(editedDurationSeconds(result.clips)).toBe(4)
    expect(replaceVideoClipSource(initial, 'a', 'short', 3)).toMatchObject({ replaced: false, reason: 'source-too-short' })
  })

  it('re-maps source-anchored captions after clip order changes', () => {
    const clips = [clip('a', 0, 4), clip('b', 10, 13)]
    const captions: EditingCaption[] = [{ id: 'caption-b', sourceId: 'main', sourceStartSeconds: 10.5, sourceEndSeconds: 11.5, startSeconds: 4.5, durationSeconds: 1, kind: 'source', text: 'second clip' }]
    const next = [clips[1]!, clips[0]!]
    expect(reorderEditingCaptions(captions, clips, next)).toMatchObject([{ id: 'caption-b', startSeconds: 0.5, durationSeconds: 1 }])
  })

  it('trims either side and reports the removed edited range', () => {
    const initial = [clip('a', 0, 10)]
    const left = trimVideoClipLeftAtEdited(initial, 3)
    expect(left.clips[0]).toMatchObject({ sourceStartSeconds: 3, sourceEndSeconds: 10 })
    expect(left.removedRange).toEqual({ startSeconds: 0, endSeconds: 3 })

    const right = trimVideoClipRightAtEdited(initial, 7)
    expect(right.clips[0]).toMatchObject({ sourceStartSeconds: 0, sourceEndSeconds: 7 })
    expect(right.removedRange).toEqual({ startSeconds: 7, endSeconds: 10 })
  })

  it('trims a selected clip boundary inward without changing other clips', () => {
    const initial = [clip('a', 0, 10), clip('b', 20, 24)]
    const start = trimVideoClipBoundaryAtEdited(initial, 'a', 'start', 2.5)
    expect(start.clips.map((item) => [item.id, item.sourceStartSeconds, item.sourceEndSeconds])).toEqual([
      ['a', 2.5, 10],
      ['b', 20, 24]
    ])
    expect(start.removedRange).toEqual({ startSeconds: 0, endSeconds: 2.5 })

    const end = trimVideoClipBoundaryAtEdited(initial, 'b', 'end', 12.5)
    expect(end.clips[1]).toMatchObject({ id: 'b', sourceStartSeconds: 20, sourceEndSeconds: 22.5 })
    expect(end.removedRange).toEqual({ startSeconds: 12.5, endSeconds: 14 })
    expect(trimVideoClipBoundaryAtEdited(initial, 'a', 'start', 0)).toEqual({ clips: initial, removedRange: null })
  })

  it('removes a range across clip boundaries and preserves source continuity', () => {
    const result = removeEditedVideoRange(
      [clip('a', 0, 4), clip('b', 10, 14)],
      2,
      6,
      createRight
    )

    expect(result.removedRange).toEqual({ startSeconds: 2, endSeconds: 6 })
    expect(result.clips.map((item) => [item.id, item.sourceStartSeconds, item.sourceEndSeconds])).toEqual([
      ['a', 0, 2],
      ['b-right', 12, 14]
    ])
    expect(editedDurationSeconds(result.clips)).toBe(4)
  })

  it('removes multiple detected ranges in one history-safe batch', () => {
    const result = removeEditedVideoRanges([clip('a', 0, 12), clip('b', 20, 24)], [{ startSeconds: 2, endSeconds: 3 }, { startSeconds: 7, endSeconds: 9 }], (base, start, end) => ({ ...base, id: `${base.id}-${start}`, sourceStartSeconds: start, sourceEndSeconds: end }))
    expect(result.removedRanges).toEqual([{ startSeconds: 2, endSeconds: 3 }, { startSeconds: 7, endSeconds: 9 }])
    expect(result.clips.map((item) => [item.id, item.sourceStartSeconds, item.sourceEndSeconds])).toEqual([
      ['a', 0, 2],
      ['a-3', 3, 7],
      ['a-9', 9, 12],
      ['b', 20, 24]
    ])
    expect(editedDurationSeconds(result.clips)).toBe(13)
  })

  it('does not delete the only remaining clip', () => {
    const clips = [clip('a', 0, 10)]
    expect(deleteVideoClipAtEdited(clips, 3)).toEqual({ clips, removedRange: null })
    expect(removeEditedVideoRange(clips, 0, 10, createRight)).toEqual({ clips, removedRange: null })
  })

  it('deletes selected clips as one edited-time batch and preserves the remaining order', () => {
    const result = deleteVideoClipsById(
      [clip('a', 0, 4), clip('b', 10, 13), clip('c', 20, 25)],
      ['b', 'c'],
      (base, start, end) => ({ ...base, id: `${base.id}-right`, sourceStartSeconds: start, sourceEndSeconds: end })
    )
    expect(result.removedRanges).toEqual([{ startSeconds: 4, endSeconds: 12 }])
    expect(result.clips.map((item) => [item.id, item.sourceStartSeconds, item.sourceEndSeconds])).toEqual([
      ['a', 0, 4]
    ])
    expect(editedDurationSeconds(result.clips)).toBe(4)
  })

  it('keeps the primary track renderable when selection includes its only clip', () => {
    const clips = [clip('only', 0, 10)]
    expect(deleteVideoClipsById(clips, ['only'])).toEqual({ clips, removedRanges: [] })
  })

  it('applies source-time cuts after resolving current edited positions', () => {
    const result = removeSourceVideoRanges(
      [clip('a', 0, 10)],
      'main',
      [{ startSeconds: 2, endSeconds: 3 }, { startSeconds: 6, endSeconds: 8 }],
      createRight
    )

    expect(result.clips.map((item) => [item.sourceStartSeconds, item.sourceEndSeconds])).toEqual([
      [0, 2],
      [3, 6],
      [8, 10]
    ])
    expect(result.removedRanges).toEqual([
      { startSeconds: 2, endSeconds: 3 },
      { startSeconds: 5, endSeconds: 7 }
    ])
  })

  it('restores a source-time gap and keeps foreign clips attached to their source predecessor', () => {
    const initial = [clip('left', 0, 3), clip('secondary', 0, 2, 'secondary'), clip('right', 5, 8)]
    const result = restoreSourceVideoRange(initial, 'main', 3, 5, (start, end) => clip('restored', start, end))

    expect(result.restored).toBe(true)
    expect(result.clips.map((item) => [item.id, item.sourceId, item.sourceStartSeconds, item.sourceEndSeconds])).toEqual([
      ['left', 'main', 0, 5],
      ['secondary', 'secondary', 0, 2],
      ['right', 'main', 5, 8]
    ])
    expect(editedDurationSeconds(result.clips)).toBe(10)
    expect(restoreSourceVideoRange(result.clips, 'main', 3, 5, (start, end) => clip('duplicate', start, end))).toEqual({ clips: result.clips, restored: false })
  })

  it('can restore a source range after that source was fully removed', () => {
    const restored = restoreSourceVideoRange([clip('secondary', 0, 2, 'secondary')], 'main', 2, 4, (start, end) => clip('restored-main', start, end))
    expect(restored).toEqual({ clips: [clip('restored-main', 2, 4), clip('secondary', 0, 2, 'secondary')], restored: true })
  })
})

describe('edited overlay compression', () => {
  it('shifts later captions and shortens a caption crossing the removed range', () => {
    const captions: EditingCaption[] = [
      { id: 'before', kind: 'source', text: 'before', startSeconds: 0, durationSeconds: 2 },
      { id: 'crossing', kind: 'source', text: 'crossing', startSeconds: 1, durationSeconds: 5 },
      { id: 'after', kind: 'source', text: 'after', startSeconds: 8, durationSeconds: 2 }
    ]

    expect(removeEditedInterval(captions, 2, 4)).toEqual([
      { id: 'before', kind: 'source', text: 'before', startSeconds: 0, durationSeconds: 2 },
      { id: 'crossing', kind: 'source', text: 'crossing', startSeconds: 1, durationSeconds: 3 },
      { id: 'after', kind: 'source', text: 'after', startSeconds: 6, durationSeconds: 2 }
    ])
  })

  it('compresses graphic blocks with the edited timeline while keeping old projects without graphics unchanged', () => {
    const project = createEditingProject({ id: 'source-1', path: '/videos/demo.mp4', name: 'demo.mp4', fingerprint: 'demo:10', durationSeconds: 10 })
    const graphics: EditingGraphic[] = [
      { id: 'before', startSeconds: 0, durationSeconds: 2, text: 'before', position: 'center', style: 'title' },
      { id: 'crossing', startSeconds: 1, durationSeconds: 5, text: 'crossing', position: 'center', style: 'label' },
      { id: 'after', startSeconds: 8, durationSeconds: 1, text: 'after', position: 'bottom-right', style: 'label' }
    ]
    const next = withUpdatedTimelineRanges({ ...project, graphics }, project.videoClips, [{ startSeconds: 2, endSeconds: 4 }])
    expect(next.graphics).toEqual([
      { id: 'before', startSeconds: 0, durationSeconds: 2, text: 'before', position: 'center', style: 'title' },
      { id: 'crossing', startSeconds: 1, durationSeconds: 3, text: 'crossing', position: 'center', style: 'label' },
      { id: 'after', startSeconds: 6, durationSeconds: 1, text: 'after', position: 'bottom-right', style: 'label' }
    ])
    expect(withUpdatedTimelineRanges(project, project.videoClips, [{ startSeconds: 2, endSeconds: 4 }])).not.toHaveProperty('graphics')
  })
})
