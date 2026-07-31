import { describe, expect, it } from 'vitest'
import { EDITING_TRANSITION_DEFAULT_DURATION, type EditingVideoClip } from '../../src/shared/editing-types'
import { getEditingClipTransition, normalizeEditingClipTransitions, updateEditingClipTransition } from '../../src/core/editing/transition-operations'
import { parseEditingProject } from '../../src/core/editing/project-file'

const clip = (id: string): EditingVideoClip => ({ id, sourceId: 'source-1', sourceStartSeconds: 0, sourceEndSeconds: 4 })

describe('editing transition operations', () => {
  it('defaults to no transition and clamps the stored seam duration', () => {
    expect(getEditingClipTransition(clip('clip-1'))).toBeNull()
    expect(getEditingClipTransition({ transitionIn: { type: 'fade', durationSeconds: 9 } })).toEqual({ type: 'fade', durationSeconds: 1 })
    expect(getEditingClipTransition({ transitionIn: { type: 'wipe-left', durationSeconds: 0.4 } })).toEqual({ type: 'wipe-left', durationSeconds: 0.4 })
    expect(getEditingClipTransition({ transitionIn: { type: 'circleopen', durationSeconds: 0.4 } })).toEqual({ type: 'circleopen', durationSeconds: 0.4 })
  })

  it('updates only the selected clip and clears it without leaving an empty field', () => {
    const clips = updateEditingClipTransition([clip('clip-1'), clip('clip-2')], 'clip-2', { type: 'crosszoom', durationSeconds: EDITING_TRANSITION_DEFAULT_DURATION })
    expect(clips[1]).toMatchObject({ transitionIn: { type: 'crosszoom', durationSeconds: EDITING_TRANSITION_DEFAULT_DURATION } })
    expect(updateEditingClipTransition(clips, 'clip-2', null)[1]).toEqual(clip('clip-2'))
  })

  it('removes an incoming transition from a clip that becomes the first clip', () => {
    const clips = normalizeEditingClipTransitions(updateEditingClipTransition([clip('clip-1'), clip('clip-2')], 'clip-1', { type: 'fade', durationSeconds: 0.5 }))
    expect(clips[0]).toEqual(clip('clip-1'))
  })

  it('accepts a valid transition in project files and rejects invalid durations', () => {
    const base = { schemaVersion: 1, id: 'project-1', title: 'demo', createdAt: 1, updatedAt: 1, sources: [{ id: 'source-1', path: '/tmp/demo.mp4', name: 'demo.mp4', fingerprint: 'demo', durationSeconds: 8 }], videoClips: [clip('clip-1'), { ...clip('clip-2'), transitionIn: { type: 'dissolve', durationSeconds: 0.5 } }], captions: [] }
    expect(parseEditingProject(base).videoClips[1]?.transitionIn).toEqual({ type: 'dissolve', durationSeconds: 0.5 })
    expect(() => parseEditingProject({ ...base, videoClips: [{ ...base.videoClips[1], transitionIn: { type: 'fade', durationSeconds: 2 } }] })).toThrow('Invalid editing project clip')
    expect(() => parseEditingProject({ ...base, videoClips: [{ ...base.videoClips[1], transitionIn: { type: 'unknown', durationSeconds: 0.5 } }] })).toThrow('Invalid editing project clip')
  })
})
