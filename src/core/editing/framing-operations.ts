import { EDITING_TRANSITION_DEFAULT_DURATION, type EditingClipTreatment, type EditingTreatmentAnchor, type EditingVideoClip } from '../../shared/editing-types'
import { getEditingClipTreatment, getEditingClipTreatmentAnchor, getEditingClipTreatmentRenderScale, getEditingClipTreatmentSize } from './treatment-operations'

export type EditingFramingState = {
  treatment: EditingClipTreatment
  scale: number
  size: number
  anchor: EditingTreatmentAnchor
}

export type EditingFramingSpan = {
  editedStartSeconds: number
  editedEndSeconds: number
  clip: Pick<EditingVideoClip, 'treatment' | 'treatmentScale' | 'treatmentAnchor' | 'treatmentSize'>
}

export type EditingFramingKeyframe = {
  at: number
  endAt: number
  state: EditingFramingState
}

export type EditingFramingTransform = {
  scale: number
  translateXPercent: number
  translateYPercent: number
}

export type EditingFramingTransition = {
  from: EditingFramingState
  to: EditingFramingState
  durationSeconds: number
}

export type EditingFramingResolution = EditingFramingTransform & {
  state: EditingFramingState
  isTransitioning: boolean
}

function isCompactFramingTreatment(treatment: EditingClipTreatment): boolean {
  return treatment === 'corner-br'
    || treatment === 'corner-tl'
    || treatment === 'split-left'
    || treatment === 'split-right'
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

function safeTime(value: number): number {
  return Number.isFinite(value) ? value : 0
}

function sameFramingState(left: EditingFramingState, right: EditingFramingState): boolean {
  return left.treatment === right.treatment
    && left.scale === right.scale
    && (!isCompactFramingTreatment(left.treatment) && !isCompactFramingTreatment(right.treatment) || left.size === right.size)
    && left.anchor === right.anchor
}

function anchorPosition(anchor: EditingTreatmentAnchor): number {
  return anchor === 'left' ? 0 : anchor === 'right' ? 1 : 0.5
}

function rounded(value: number): number {
  return Math.round(value * 1000) / 1000
}

/** Converts a crop anchor into the center-origin transform used by the preview. */
export function getEditingFramingTransform(state: EditingFramingState): EditingFramingTransform {
  const scale = state.treatment === 'full' ? 1 : state.scale
  if (state.treatment === 'corner-br') {
    const edge = rounded((1 - scale) / 2 * 100)
    return { scale, translateXPercent: edge, translateYPercent: edge }
  }
  if (state.treatment === 'corner-tl') {
    const edge = rounded((1 - scale) / 2 * 100)
    return { scale, translateXPercent: -edge, translateYPercent: -edge }
  }
  if (state.treatment === 'split-left' || state.treatment === 'split-right') {
    const edge = rounded((1 - scale) / 2 * 100)
    return { scale, translateXPercent: state.treatment === 'split-left' ? -edge : edge, translateYPercent: 0 }
  }
  return { scale, translateXPercent: rounded((anchorPosition(state.anchor) - 0.5) * (1 - scale) * 100), translateYPercent: 0 }
}

/** Old project files have no framing fields; they resolve to a centered full frame. */
export function getEditingFramingState(clip: Pick<EditingVideoClip, 'treatment' | 'treatmentScale' | 'treatmentAnchor' | 'treatmentSize'>): EditingFramingState {
  const treatment = getEditingClipTreatment(clip)
  return {
    treatment,
    scale: getEditingClipTreatmentRenderScale(clip),
    size: getEditingClipTreatmentSize(clip),
    anchor: treatment === 'punch-in' ? getEditingClipTreatmentAnchor(clip) : 'center'
  }
}

/** Turns sequential clips into a compact Pireel-style framing keyframe list. */
export function getEditingFramingKeyframes(spans: readonly EditingFramingSpan[]): EditingFramingKeyframe[] {
  const keyframes: EditingFramingKeyframe[] = []
  for (const span of spans) {
    const at = Math.max(0, safeTime(span.editedStartSeconds))
    const endAt = Math.max(at, safeTime(span.editedEndSeconds))
    const state = getEditingFramingState(span.clip)
    const previous = keyframes[keyframes.length - 1]
    if (previous && sameFramingState(previous.state, state)) {
      previous.endAt = Math.max(previous.endAt, endAt)
      continue
    }
    keyframes.push({ at, endAt, state })
  }
  return keyframes
}

export function getEditingFramingTransition(from: EditingFramingState, to: EditingFramingState, durationSeconds = EDITING_TRANSITION_DEFAULT_DURATION): EditingFramingTransition | null {
  if (sameFramingState(from, to)) return null
  return { from, to, durationSeconds: Math.max(0, Math.min(EDITING_TRANSITION_DEFAULT_DURATION, Number.isFinite(durationSeconds) ? durationSeconds : EDITING_TRANSITION_DEFAULT_DURATION)) }
}

/** Resolves the current framing and interpolates only at a clip boundary. */
export function resolveEditingFramingAtTime(keyframes: readonly EditingFramingKeyframe[], editedTimeSeconds: number, transitionDurationSeconds = EDITING_TRANSITION_DEFAULT_DURATION): EditingFramingResolution | null {
  if (keyframes.length === 0) return null
  const time = safeTime(editedTimeSeconds)
  let currentIndex = 0
  for (let index = 1; index < keyframes.length; index += 1) {
    if (time < keyframes[index]!.at) break
    currentIndex = index
  }
  const current = keyframes[currentIndex]!
  const currentTransform = getEditingFramingTransform(current.state)
  if (currentIndex === 0) return { ...currentTransform, state: current.state, isTransitioning: false }

  const previous = keyframes[currentIndex - 1]!
  const transition = getEditingFramingTransition(previous.state, current.state, Math.min(transitionDurationSeconds, current.endAt - current.at))
  if (!transition || time >= current.at + transition.durationSeconds) return { ...currentTransform, state: current.state, isTransitioning: false }

  const progress = transition.durationSeconds <= 0 ? 1 : clamp((time - current.at) / transition.durationSeconds, 0, 1)
  const fromTransform = getEditingFramingTransform(transition.from)
  const toTransform = getEditingFramingTransform(transition.to)
  return {
    scale: rounded(fromTransform.scale + (toTransform.scale - fromTransform.scale) * progress),
    translateXPercent: rounded(fromTransform.translateXPercent + (toTransform.translateXPercent - fromTransform.translateXPercent) * progress),
    translateYPercent: rounded(fromTransform.translateYPercent + (toTransform.translateYPercent - fromTransform.translateYPercent) * progress),
    state: current.state,
    isTransitioning: true
  }
}
