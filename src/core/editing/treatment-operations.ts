import { EDITING_PUNCH_IN_DEFAULT_SCALE, EDITING_PUNCH_IN_MAX_SCALE, EDITING_PUNCH_IN_MIN_SCALE, EDITING_TREATMENT_SIZE_DEFAULT, EDITING_TREATMENT_SIZE_MAX, EDITING_TREATMENT_SIZE_MIN, type EditingClipTreatment, type EditingTreatmentAnchor, type EditingVideoClip } from '../../shared/editing-types'

export function getEditingClipTreatment(clip: Pick<EditingVideoClip, 'treatment'>): EditingClipTreatment {
  return clip.treatment === 'punch-in' || clip.treatment === 'corner-br' || clip.treatment === 'corner-tl' || clip.treatment === 'split-left' || clip.treatment === 'split-right' ? clip.treatment : 'full'
}

export function getEditingClipTreatmentScale(clip: Pick<EditingVideoClip, 'treatmentScale'>): number {
  const scale = clip.treatmentScale
  return scale !== undefined && Number.isFinite(scale) ? Math.min(EDITING_PUNCH_IN_MAX_SCALE, Math.max(EDITING_PUNCH_IN_MIN_SCALE, scale)) : EDITING_PUNCH_IN_DEFAULT_SCALE
}

export function getEditingClipTreatmentAnchor(clip: Pick<EditingVideoClip, 'treatmentAnchor'>): EditingTreatmentAnchor {
  return clip.treatmentAnchor === 'left' || clip.treatmentAnchor === 'right' ? clip.treatmentAnchor : 'center'
}

export function getEditingClipTreatmentSize(clip: Pick<EditingVideoClip, 'treatment' | 'treatmentSize'>): number {
  const treatment = getEditingClipTreatment(clip)
  const size = clip.treatmentSize
  return size !== undefined && Number.isFinite(size)
    ? Math.min(EDITING_TREATMENT_SIZE_MAX, Math.max(EDITING_TREATMENT_SIZE_MIN, size))
    : EDITING_TREATMENT_SIZE_DEFAULT[treatment]
}

/** Converts Pireel-style 0–100 framing size into the scale used by preview/export. */
export function getEditingClipTreatmentRenderScale(clip: Pick<EditingVideoClip, 'treatment' | 'treatmentScale' | 'treatmentSize'>): number {
  const treatment = getEditingClipTreatment(clip)
  if (treatment === 'full') return 1
  if (treatment === 'punch-in') return getEditingClipTreatmentScale(clip)
  const value = getEditingClipTreatmentSize(clip) / 100
  if (treatment === 'corner-br' || treatment === 'corner-tl') return Math.round((0.2 + value * 0.4) * 1000) / 1000
  return Math.round((0.3 + value * 0.4) * 1000) / 1000
}

export function updateEditingClipTreatment(clips: readonly EditingVideoClip[], clipId: string, treatment: EditingClipTreatment, scale = EDITING_PUNCH_IN_DEFAULT_SCALE, anchor: EditingTreatmentAnchor = 'center', size?: number): EditingVideoClip[] {
  return clips.map((clip) => {
    if (clip.id !== clipId) return clip
    const nextClip: EditingVideoClip = { ...clip, treatment }
    if (treatment === 'punch-in') {
      nextClip.treatmentScale = getEditingClipTreatmentScale({ treatmentScale: scale })
      nextClip.treatmentAnchor = getEditingClipTreatmentAnchor({ treatmentAnchor: anchor })
      delete nextClip.treatmentSize
    } else if (treatment === 'full') {
      delete nextClip.treatment
      delete nextClip.treatmentScale
      delete nextClip.treatmentAnchor
      delete nextClip.treatmentSize
    } else {
      nextClip.treatmentSize = getEditingClipTreatmentSize({ treatment, treatmentSize: size })
      delete nextClip.treatmentScale
      delete nextClip.treatmentAnchor
    }
    return nextClip
  })
}
