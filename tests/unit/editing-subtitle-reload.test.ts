import { describe, expect, it } from 'vitest'
import { createEditingProject } from '../../src/core/editing/project'
import { buildEditingSubtitleReloadPreview, getEditingSubtitleReloadChangePage, getEditingSubtitleReloadChangePreview, getEditingSubtitleReloadChangeScriptSegmentId, getEditingSubtitleReloadIncomingPreview, replaceEditingCaptionsForReload } from '../../src/core/editing/subtitle-reload'

const source = { id: 'source-1', path: '/tmp/demo.mp4', name: 'demo.mp4', fingerprint: 'demo:10', durationSeconds: 10 }

const caption = (overrides: Partial<{ id: string; kind: 'source' | 'translation'; text: string; startSeconds: number; sourceStartSeconds: number; sourceEndSeconds: number }>) => ({
  id: 'source-caption-1',
  sourceId: source.id,
  sourceStartSeconds: 1,
  sourceEndSeconds: 2,
  startSeconds: 1,
  durationSeconds: 1,
  text: '原始字幕',
  kind: 'source' as const,
  ...overrides
})

describe('editing subtitle reload', () => {
  it('maps source and translation diff IDs back to script segments', () => {
    expect(getEditingSubtitleReloadChangeScriptSegmentId({ id: 'source-caption-1', kind: 'source' })).toBe('source-caption-1')
    expect(getEditingSubtitleReloadChangeScriptSegmentId({ id: 'translation-source-caption-1', kind: 'translation' })).toBe('source-caption-1')
    expect(getEditingSubtitleReloadChangeScriptSegmentId({ id: 'translation-caption-1', kind: 'translation' })).toBe('caption-1')
  })

  it('builds a transient preview only for valid incoming-only cues', () => {
    const sourceChange = { id: 'source-caption-2', kind: 'source' as const, status: 'added' as const, incomingText: '新增字幕', incomingStartSeconds: 3, incomingEndSeconds: 4 }
    const translationChange = { id: 'translation-source-caption-2', kind: 'translation' as const, status: 'added' as const, incomingText: 'New subtitle', incomingStartSeconds: 3.1, incomingEndSeconds: 4.1 }
    const loaderSourceChange = { id: 'source-source-abc-2', kind: 'source' as const, status: 'added' as const, incomingText: 'Loader source', incomingStartSeconds: 3, incomingEndSeconds: 4 }
    const loaderTranslationChange = { id: 'translation-source-abc-2', kind: 'translation' as const, status: 'added' as const, incomingText: 'Loader translation', incomingStartSeconds: 3, incomingEndSeconds: 4 }
    expect(getEditingSubtitleReloadIncomingPreview(sourceChange)).toEqual({ id: 'incoming-source-source-caption-2', kind: 'source', text: '新增字幕', startSeconds: 3, endSeconds: 4, current: null, incoming: { source: { kind: 'source', text: '新增字幕', startSeconds: 3, endSeconds: 4 } } })
    expect(getEditingSubtitleReloadIncomingPreview(sourceChange, [sourceChange, translationChange])).toMatchObject({ current: null, incoming: { source: { text: '新增字幕' }, translation: { text: 'New subtitle', startSeconds: 3.1, endSeconds: 4.1 } } })
    expect(getEditingSubtitleReloadIncomingPreview(loaderSourceChange, [loaderSourceChange, loaderTranslationChange])).toMatchObject({ incoming: { source: { text: 'Loader source' }, translation: { text: 'Loader translation' } } })
    expect(getEditingSubtitleReloadIncomingPreview({ id: 'source-caption-1', kind: 'source', status: 'changed', incomingText: '新文本', incomingStartSeconds: 1, incomingEndSeconds: 2 })).toBeNull()
    expect(getEditingSubtitleReloadIncomingPreview({ id: 'source-caption-3', kind: 'source', status: 'added', incomingText: '坏时间', incomingStartSeconds: 4, incomingEndSeconds: 4 })).toBeNull()
  })

  it('projects changed current and incoming source/translation ranges without mutating the current cue', () => {
    const sourceChange = { id: 'source-source-abc-9', kind: 'source' as const, status: 'changed' as const, currentText: '旧原文', currentStartSeconds: 18, currentEndSeconds: 19.5, incomingText: '新原文', incomingStartSeconds: 19, incomingEndSeconds: 20.5 }
    const translationChange = { id: 'translation-source-abc-9', kind: 'translation' as const, status: 'changed' as const, currentText: '旧译文', currentStartSeconds: 18, currentEndSeconds: 19.5, incomingText: 'New translation', incomingStartSeconds: 19, incomingEndSeconds: 20.5 }

    expect(getEditingSubtitleReloadChangePreview(sourceChange, [sourceChange, translationChange])).toEqual({
      id: 'preview-source-source-source-abc-9',
      kind: 'source',
      text: '新原文',
      startSeconds: 19,
      endSeconds: 20.5,
      current: {
        source: { kind: 'source', text: '旧原文', startSeconds: 18, endSeconds: 19.5 },
        translation: { kind: 'translation', text: '旧译文', startSeconds: 18, endSeconds: 19.5 }
      },
      incoming: {
        source: { kind: 'source', text: '新原文', startSeconds: 19, endSeconds: 20.5 },
        translation: { kind: 'translation', text: 'New translation', startSeconds: 19, endSeconds: 20.5 }
      }
    })
    expect(getEditingSubtitleReloadChangePreview({ ...sourceChange, status: 'removed', incomingText: undefined, incomingStartSeconds: undefined, incomingEndSeconds: undefined })).toBeNull()
  })

  it('summarizes changed, added and removed source/translation captions', () => {
    const current = [caption({}), caption({ id: 'translation-caption-1', kind: 'translation', text: '旧翻译' })]
    const incoming = [caption({ text: '外部新字幕' }), caption({ id: 'source-caption-2', text: '新增字幕', startSeconds: 3, sourceStartSeconds: 3, sourceEndSeconds: 4 })]

    expect(buildEditingSubtitleReloadPreview(current, incoming)).toMatchObject({
      hasChanges: true,
      addedCount: 1,
      removedCount: 1,
      changedCount: 1,
      sourceChangedCount: 2,
      translationChangedCount: 1,
      changes: [
        { id: 'source-caption-1', status: 'changed', currentText: '原始字幕', incomingText: '外部新字幕' },
        { id: 'source-caption-2', status: 'added', incomingText: '新增字幕' },
        { id: 'translation-caption-1', status: 'removed', currentText: '旧翻译' }
      ]
    })
  })

  it('ignores word-timing enrichment when deciding whether a reload is destructive', () => {
    const current = [caption({})]
    const incoming = [{ ...current[0], words: [{ startSeconds: 0, endSeconds: 1, text: '原始字幕' }] }]

    expect(buildEditingSubtitleReloadPreview(current, incoming).hasChanges).toBe(false)
  })

  it('keeps the complete diff and paginates searchable changes without losing counts', () => {
    const current = Array.from({ length: 18 }, (_, index) => caption({ id: `source-caption-${index}`, text: `当前字幕 ${index}`, startSeconds: index + 1, sourceStartSeconds: index + 1, sourceEndSeconds: index + 2 }))
    const incoming = current.map((item, index) => ({ ...item, text: `外部字幕 ${index}` }))
    const preview = buildEditingSubtitleReloadPreview(current, incoming)
    expect(preview.changes).toHaveLength(18)
    expect(preview.changedCount).toBe(18)

    const page = getEditingSubtitleReloadChangePage(preview.changes, { query: '外部字幕 1', pageSize: 2, pageIndex: 0 })
    expect(page.total).toBe(9)
    expect(page.pageCount).toBe(5)
    expect(page.changes).toHaveLength(2)
    expect(page.changes.every((change) => change.incomingText?.includes('外部字幕 1'))).toBe(true)

    const lastPage = getEditingSubtitleReloadChangePage(preview.changes, { status: 'changed', kind: 'source', pageSize: 4, pageIndex: 99 })
    expect(lastPage.pageIndex).toBe(4)
    expect(lastPage.changes).toHaveLength(2)

    const timedPage = getEditingSubtitleReloadChangePage(preview.changes, { timeStartSeconds: 5.1, timeEndSeconds: 5.9 })
    expect(timedPage.total).toBe(1)
    expect(timedPage.changes[0]).toMatchObject({ id: 'source-caption-4', currentStartSeconds: 5, incomingStartSeconds: 5 })
  })

  it('replaces caption and script tracks while preserving timeline edits', () => {
    const project = {
      ...createEditingProject(source, { now: 100 }),
      videoClips: [{ ...createEditingProject(source, { now: 100 }).videoClips[0]!, sourceStartSeconds: 2 }],
      captions: [caption({})],
      scriptSegments: [{ id: 'source-caption-1', sourceId: source.id, sourceStartSeconds: 1, sourceEndSeconds: 2, text: '手工修改', deleted: true }]
    }
    const incoming = [caption({ text: '外部新字幕' })]

    const next = replaceEditingCaptionsForReload(project, incoming, 'raw:200', 300)

    expect(next.videoClips).toEqual(project.videoClips)
    expect(next.captions).toEqual(incoming)
    expect(next.scriptSegments).toEqual([{ id: 'source-caption-1', sourceId: source.id, sourceStartSeconds: 1, sourceEndSeconds: 2, text: '外部新字幕' }])
    expect(next.captionSourceRevision).toBe('raw:200')
    expect(next.updatedAt).toBe(300)
  })
})
