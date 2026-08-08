import { describe, expect, it } from 'vitest'
import { createEditingProject } from '../../src/core/editing/project'
import { applyEditingSubtitleReloadAddition, applyEditingSubtitleReloadChange, applyEditingSubtitleReloadRemoval, buildEditingSubtitleReloadPreview, getEditingSubtitleReloadChangePage, getEditingSubtitleReloadChangePreview, getEditingSubtitleReloadChangeScriptSegmentId, getEditingSubtitleReloadIncomingPreview, replaceEditingCaptionsForReload, shareEditingSubtitleReloadScriptSegmentIds } from '../../src/core/editing/subtitle-reload'

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
    expect(shareEditingSubtitleReloadScriptSegmentIds('source-source-abc-1', 'source-abc-1')).toBe(true)
    expect(shareEditingSubtitleReloadScriptSegmentIds('source-source-abc-1', 'source-other-1')).toBe(false)
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

  it('accepts one changed source or translation cue without replacing other tracks', () => {
    const currentSource = caption({ text: '当前原文', startSeconds: 1, sourceStartSeconds: 1, sourceEndSeconds: 2 })
    const currentTranslation = caption({ id: 'translation-source-caption-1', kind: 'translation', text: '当前译文', startSeconds: 1, sourceStartSeconds: 1, sourceEndSeconds: 2 })
    const incomingSource = { ...currentSource, text: '新原文', startSeconds: 2, sourceStartSeconds: 2, sourceEndSeconds: 3, durationSeconds: 1, words: [{ startSeconds: 0, endSeconds: 0.4, text: '新原文' }] }
    const incomingTranslation = { ...currentTranslation, text: 'New translation', startSeconds: 2, sourceStartSeconds: 2, sourceEndSeconds: 3, durationSeconds: 1 }
    const untouched = caption({ id: 'source-caption-2', text: '保持不变', startSeconds: 5, sourceStartSeconds: 5, sourceEndSeconds: 6 })
    const project = {
      ...createEditingProject(source, { now: 100 }),
      captions: [currentSource, currentTranslation, untouched],
      scriptSegments: [{ id: currentSource.id, sourceId: source.id, sourceStartSeconds: 1, sourceEndSeconds: 2, text: '手工原文', words: [{ startSeconds: 0, endSeconds: 0.3, text: '手工原文' }], translationText: '手工译文', deleted: true }]
    }
    const sourceChange = { id: currentSource.id, kind: 'source' as const, status: 'changed' as const, currentText: currentSource.text, currentStartSeconds: 1, currentEndSeconds: 2, incomingText: incomingSource.text, incomingStartSeconds: 2, incomingEndSeconds: 3 }
    const translationChange = { id: currentTranslation.id, kind: 'translation' as const, status: 'changed' as const, currentText: currentTranslation.text, currentStartSeconds: 1, currentEndSeconds: 2, incomingText: incomingTranslation.text, incomingStartSeconds: 2, incomingEndSeconds: 3 }

    const afterSource = applyEditingSubtitleReloadChange(project, [incomingSource, incomingTranslation, untouched], sourceChange, 200)
    expect(afterSource?.captions).toEqual([currentTranslation, incomingSource, untouched])
    expect(afterSource?.scriptSegments).toEqual([{ id: currentSource.id, sourceId: source.id, sourceStartSeconds: 2, sourceEndSeconds: 3, text: '新原文', words: incomingSource.words, translationText: '手工译文', deleted: true }])
    expect(afterSource?.videoClips).toEqual(project.videoClips)
    expect(afterSource?.updatedAt).toBe(200)

    const afterTranslation = applyEditingSubtitleReloadChange(project, [currentSource, incomingTranslation, untouched], translationChange, 300)
    expect(afterTranslation?.captions).toEqual([currentSource, incomingTranslation, untouched])
    expect(afterTranslation?.scriptSegments?.[0]).toMatchObject({ text: '手工原文', translationText: 'New translation', sourceStartSeconds: 1, sourceEndSeconds: 2, deleted: true })
    expect(afterTranslation?.scriptSegments?.[0]?.words).toEqual(project.scriptSegments?.[0]?.words)

    const loaderSource = caption({ id: 'source-source-abc-1', text: '加载原文' })
    const loaderTranslation = caption({ id: 'translation-source-abc-1', kind: 'translation', text: '加载译文' })
    const loaderIncomingTranslation = { ...loaderTranslation, text: 'Loader translation' }
    const loaderProject = {
      ...createEditingProject(source, { now: 100 }),
      captions: [loaderSource, loaderTranslation],
      scriptSegments: [{ id: loaderSource.id, sourceId: source.id, sourceStartSeconds: 1, sourceEndSeconds: 2, text: loaderSource.text, translationText: loaderTranslation.text }]
    }
    const loaderTranslationChange = { id: loaderTranslation.id, kind: 'translation' as const, status: 'changed' as const, currentText: loaderTranslation.text, incomingText: loaderIncomingTranslation.text, currentStartSeconds: 1, currentEndSeconds: 2, incomingStartSeconds: 1, incomingEndSeconds: 2 }
    expect(applyEditingSubtitleReloadChange(loaderProject, [loaderSource, loaderIncomingTranslation], loaderTranslationChange)?.scriptSegments?.[0]).toMatchObject({ id: loaderSource.id, translationText: loaderIncomingTranslation.text })
  })

  it('rejects added, removed, stale, or missing cues instead of applying a broad reload', () => {
    const current = caption({})
    const project = { ...createEditingProject(source, { now: 100 }), captions: [current] }
    const changed = { id: current.id, kind: 'source' as const, status: 'changed' as const, currentText: current.text, incomingText: '新文本', currentStartSeconds: 1, currentEndSeconds: 2, incomingStartSeconds: 1, incomingEndSeconds: 2 }
    expect(applyEditingSubtitleReloadChange(project, [current], { ...changed, status: 'added' })).toBeNull()
    expect(applyEditingSubtitleReloadChange(project, [current], { ...changed, status: 'removed', incomingText: undefined })).toBeNull()
    expect(applyEditingSubtitleReloadChange(project, [current], { ...changed, currentText: '已被再次编辑' })).toBeNull()
    expect(applyEditingSubtitleReloadChange(project, [], changed)).toBeNull()
  })

  it('adds one incoming source or translation cue while preserving the rest of the project', () => {
    const currentSource = caption({ text: '当前原文' })
    const incomingSource = { ...currentSource, id: 'source-caption-2', text: '新增原文', startSeconds: 3, sourceStartSeconds: 3, sourceEndSeconds: 4, durationSeconds: 1, words: [{ startSeconds: 0, endSeconds: 0.5, text: '新增原文' }] }
    const incomingTranslation = { ...incomingSource, id: 'translation-source-caption-2', kind: 'translation' as const, text: 'New translation' }
    const project = {
      ...createEditingProject(source, { now: 100 }),
      captions: [currentSource],
      scriptSegments: [{ id: currentSource.id, sourceId: source.id, sourceStartSeconds: 1, sourceEndSeconds: 2, text: '手工原文', deleted: true }]
    }
    const sourceChange = { id: incomingSource.id, kind: 'source' as const, status: 'added' as const, incomingText: incomingSource.text, incomingStartSeconds: 3, incomingEndSeconds: 4 }
    const translationChange = { id: incomingTranslation.id, kind: 'translation' as const, status: 'added' as const, incomingText: incomingTranslation.text, incomingStartSeconds: 3, incomingEndSeconds: 4 }

    const afterSource = applyEditingSubtitleReloadAddition(project, [currentSource, incomingSource, incomingTranslation], sourceChange, 200)
    expect(afterSource?.captions).toEqual([currentSource, incomingSource])
    expect(afterSource?.scriptSegments).toEqual([
      { id: currentSource.id, sourceId: source.id, sourceStartSeconds: 1, sourceEndSeconds: 2, text: '手工原文', deleted: true },
      { id: incomingSource.id, sourceId: source.id, sourceStartSeconds: 3, sourceEndSeconds: 4, text: '新增原文', words: incomingSource.words, translationText: undefined }
    ])
    expect(afterSource?.videoClips).toEqual(project.videoClips)
    expect(afterSource?.updatedAt).toBe(200)

    const afterTranslation = applyEditingSubtitleReloadAddition(afterSource!, [currentSource, incomingSource, incomingTranslation], translationChange, 300)
    expect(afterTranslation?.captions).toEqual([currentSource, incomingSource, incomingTranslation])
    expect(afterTranslation?.scriptSegments?.find((segment) => segment.id === incomingSource.id)).toMatchObject({ text: '新增原文', translationText: 'New translation' })
  })

  it('rejects non-added, duplicate, stale, or missing incoming cues', () => {
    const current = caption({})
    const incoming = caption({ id: 'source-caption-2', text: '新增字幕', startSeconds: 3, sourceStartSeconds: 3, sourceEndSeconds: 4 })
    const project = { ...createEditingProject(source, { now: 100 }), captions: [current] }
    const added = { id: incoming.id, kind: 'source' as const, status: 'added' as const, incomingText: incoming.text, incomingStartSeconds: 3, incomingEndSeconds: 4 }
    expect(applyEditingSubtitleReloadAddition(project, [incoming], { ...added, status: 'changed' })).toBeNull()
    expect(applyEditingSubtitleReloadAddition({ ...project, captions: [current, incoming] }, [incoming], added)).toBeNull()
    expect(applyEditingSubtitleReloadAddition(project, [incoming], { ...added, incomingText: '已变化' })).toBeNull()
    expect(applyEditingSubtitleReloadAddition(project, [], added)).toBeNull()
  })

  it('removes one source cue with its paired translation or only clears a translation cue', () => {
    const currentSource = caption({ text: '当前原文' })
    const currentTranslation = caption({ id: 'translation-source-caption-1', kind: 'translation', text: '当前译文' })
    const untouched = caption({ id: 'source-caption-2', text: '保留字幕', startSeconds: 3, sourceStartSeconds: 3, sourceEndSeconds: 4 })
    const project = {
      ...createEditingProject(source, { now: 100 }),
      captions: [currentSource, currentTranslation, untouched],
      scriptSegments: [
        { id: currentSource.id, sourceId: source.id, sourceStartSeconds: 1, sourceEndSeconds: 2, text: '当前原文', translationText: '当前译文' },
        { id: untouched.id, sourceId: source.id, sourceStartSeconds: 3, sourceEndSeconds: 4, text: '保留字幕' }
      ]
    }
    const sourceRemoved = { id: currentSource.id, kind: 'source' as const, status: 'removed' as const, currentText: currentSource.text, currentStartSeconds: 1, currentEndSeconds: 2 }
    const translationRemoved = { id: currentTranslation.id, kind: 'translation' as const, status: 'removed' as const, currentText: currentTranslation.text, currentStartSeconds: 1, currentEndSeconds: 2 }

    const afterSource = applyEditingSubtitleReloadRemoval(project, sourceRemoved, 200)
    expect(afterSource?.captions).toEqual([untouched])
    expect(afterSource?.scriptSegments?.find((segment) => segment.id === currentSource.id)).toMatchObject({ text: '当前原文', translationText: '当前译文', deleted: true })
    expect(afterSource?.videoClips).toEqual(project.videoClips)
    expect(afterSource?.updatedAt).toBe(200)

    const afterTranslation = applyEditingSubtitleReloadRemoval(project, translationRemoved, 300)
    expect(afterTranslation?.captions).toEqual([currentSource, untouched])
    expect(afterTranslation?.scriptSegments?.find((segment) => segment.id === currentSource.id)).toMatchObject({ text: '当前原文' })
    expect(afterTranslation?.scriptSegments?.find((segment) => segment.id === currentSource.id)).not.toHaveProperty('translationText')

    const loaderSource = caption({ id: 'source-source-abc-1', text: '加载原文' })
    const loaderTranslation = caption({ id: 'translation-source-abc-1', kind: 'translation', text: '加载译文' })
    const loaderProject = {
      ...createEditingProject(source, { now: 100 }),
      captions: [loaderSource, loaderTranslation],
      scriptSegments: [{ id: loaderSource.id, sourceId: source.id, sourceStartSeconds: 1, sourceEndSeconds: 2, text: loaderSource.text, translationText: loaderTranslation.text }]
    }
    const loaderRemoved = { id: loaderSource.id, kind: 'source' as const, status: 'removed' as const, currentText: loaderSource.text, currentStartSeconds: 1, currentEndSeconds: 2 }
    expect(applyEditingSubtitleReloadRemoval(loaderProject, loaderRemoved)?.captions).toEqual([])
    expect(applyEditingSubtitleReloadRemoval(loaderProject, loaderRemoved)?.scriptSegments?.[0]).toMatchObject({ id: loaderSource.id, deleted: true })
  })

  it('rejects non-removed, stale, or missing cues instead of deleting current edits', () => {
    const current = caption({})
    const project = { ...createEditingProject(source, { now: 100 }), captions: [current] }
    const removed = { id: current.id, kind: 'source' as const, status: 'removed' as const, currentText: current.text, currentStartSeconds: 1, currentEndSeconds: 2 }
    expect(applyEditingSubtitleReloadRemoval(project, { ...removed, status: 'changed' })).toBeNull()
    expect(applyEditingSubtitleReloadRemoval(project, { ...removed, currentText: '已再次编辑' })).toBeNull()
    expect(applyEditingSubtitleReloadRemoval(project, { ...removed, id: 'missing' })).toBeNull()
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
