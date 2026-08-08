import { describe, expect, it } from 'vitest'
import { createEditingProject } from '../../src/core/editing/project'
import { buildEditingSubtitleReloadPreview, getEditingSubtitleReloadChangePage, getEditingSubtitleReloadChangeScriptSegmentId, replaceEditingCaptionsForReload } from '../../src/core/editing/subtitle-reload'

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
