import { describe, expect, it } from 'vitest'
import { getEditingCaptionsForSubtitleExport, serializeEditingCaptionsToSrt } from '../../src/core/editing/caption-serialization'
import type { EditingCaption, EditingProject } from '../../src/shared/editing-types'

describe('editing caption serialization', () => {
  it('serializes source captions in edited timeline order and excludes translations', () => {
    const captions: EditingCaption[] = [
      { id: 'translation', startSeconds: 1, durationSeconds: 1, kind: 'translation', text: '你好' },
      { id: 'later', startSeconds: 3.25, durationSeconds: 1.5, kind: 'source', text: 'later' },
      { id: 'first', startSeconds: 0, durationSeconds: 2, kind: 'source', text: ' first ' }
    ]
    expect(serializeEditingCaptionsToSrt(captions)).toBe(
      '1\n00:00:00,000 --> 00:00:02,000\nfirst\n\n2\n00:00:03,250 --> 00:00:04,750\nlater\n'
    )
  })

  it('returns empty text when no source captions are exportable', () => {
    expect(serializeEditingCaptionsToSrt([{ id: 'translation', startSeconds: 0, durationSeconds: 1, kind: 'translation', text: '译文' }])).toBe('')
  })

  it('keeps an independently kept translation in the project but excludes it from subtitle export after source deletion', () => {
    const source: EditingCaption = { id: 'source-1', sourceId: 'media', sourceStartSeconds: 0, sourceEndSeconds: 2, startSeconds: 0, durationSeconds: 2, kind: 'source', text: 'Hello' }
    const translation: EditingCaption = { id: 'translation-source-1', sourceId: 'media', sourceStartSeconds: 0, sourceEndSeconds: 2, startSeconds: 0, durationSeconds: 2, kind: 'translation', text: '你好' }
    const project = {
      captions: [source, translation],
      scriptSegments: [{ id: 'source-1', sourceId: 'media', sourceStartSeconds: 0, sourceEndSeconds: 2, text: 'Hello', translationText: '你好', deleted: true }]
    } satisfies Pick<EditingProject, 'captions' | 'scriptSegments'>

    expect(getEditingCaptionsForSubtitleExport(project)).toEqual([source])
    expect(serializeEditingCaptionsToSrt(getEditingCaptionsForSubtitleExport(project))).toContain('Hello')
  })

  it('keeps a translation exportable when its source script row is still active', () => {
    const translation: EditingCaption = { id: 'translation-source-1', sourceId: 'media', sourceStartSeconds: 0, sourceEndSeconds: 2, startSeconds: 0, durationSeconds: 2, kind: 'translation', text: '你好' }
    const project = {
      captions: [translation],
      scriptSegments: [{ id: 'source-1', sourceId: 'media', sourceStartSeconds: 0, sourceEndSeconds: 2, text: 'Hello', translationText: '你好' }]
    } satisfies Pick<EditingProject, 'captions' | 'scriptSegments'>

    expect(getEditingCaptionsForSubtitleExport(project)).toEqual([translation])
  })
})
