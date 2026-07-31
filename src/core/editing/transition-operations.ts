import { EDITING_TRANSITION_DEFAULT_DURATION, EDITING_TRANSITION_MAX_DURATION, EDITING_TRANSITION_MIN_DURATION, type EditingClipTransition, type EditingClipTransitionType, type EditingVideoClip } from '../../shared/editing-types'

export const EDITING_TRANSITION_TYPES: readonly EditingClipTransitionType[] = ['fade', 'fadeblack', 'dissolve', 'wipe-left', 'wipe-right', 'slide-left', 'slide-right', 'zoom', 'circleopen', 'crosszoom']

const editingTransitionTypeSet = new Set<EditingClipTransitionType>(EDITING_TRANSITION_TYPES)

function clampDuration(value: number): number {
  return Math.min(EDITING_TRANSITION_MAX_DURATION, Math.max(EDITING_TRANSITION_MIN_DURATION, Number.isFinite(value) ? value : EDITING_TRANSITION_DEFAULT_DURATION))
}

export function getEditingClipTransition(clip: Pick<EditingVideoClip, 'transitionIn'>): EditingClipTransition | null {
  return clip.transitionIn && editingTransitionTypeSet.has(clip.transitionIn.type) ? { type: clip.transitionIn.type, durationSeconds: clampDuration(clip.transitionIn.durationSeconds) } : null
}

export function updateEditingClipTransition(clips: readonly EditingVideoClip[], clipId: string, transition: EditingClipTransition | null): EditingVideoClip[] {
  const index = clips.findIndex((clip) => clip.id === clipId)
  if (index < 0) return [...clips]
  return clips.map((clip, clipIndex) => {
    if (clipIndex !== index) return clip
    if (!transition) {
      const { transitionIn: _transitionIn, ...withoutTransition } = clip
      return withoutTransition
    }
    return { ...clip, transitionIn: { type: transition.type, durationSeconds: clampDuration(transition.durationSeconds) } }
  })
}

/** The first clip has no incoming cut, so never leave a transition orphaned there. */
export function normalizeEditingClipTransitions(clips: readonly EditingVideoClip[]): EditingVideoClip[] {
  if (!clips[0]?.transitionIn) return [...clips]
  const { transitionIn: _transitionIn, ...withoutTransition } = clips[0]
  return [withoutTransition, ...clips.slice(1)]
}
