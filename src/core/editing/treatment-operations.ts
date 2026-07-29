import { EDITING_PUNCH_IN_DEFAULT_SCALE, EDITING_PUNCH_IN_MAX_SCALE, EDITING_PUNCH_IN_MIN_SCALE, type EditingClipTreatment, type EditingTreatmentAnchor, type EditingVideoClip } from '../../shared/editing-types'

export function getEditingClipTreatment(clip: Pick<EditingVideoClip, 'treatment'>): EditingClipTreatment {
  return clip.treatment === 'punch-in' ? 'punch-in' : 'full'
}

export function getEditingClipTreatmentScale(clip: Pick<EditingVideoClip, 'treatmentScale'>): number {
  const scale = clip.treatmentScale
  return scale !== undefined && Number.isFinite(scale) ? Math.min(EDITING_PUNCH_IN_MAX_SCALE, Math.max(EDITING_PUNCH_IN_MIN_SCALE, scale)) : EDITING_PUNCH_IN_DEFAULT_SCALE
}

export function getEditingClipTreatmentAnchor(clip: Pick<EditingVideoClip, 'treatmentAnchor'>): EditingTreatmentAnchor {
  return clip.treatmentAnchor === 'left' || clip.treatmentAnchor === 'right' ? clip.treatmentAnchor : 'center'
}

export function updateEditingClipTreatment(clips: readonly EditingVideoClip[], clipId: string, treatment: EditingClipTreatment, scale = EDITING_PUNCH_IN_DEFAULT_SCALE, anchor: EditingTreatmentAnchor = 'center'): EditingVideoClip[] {
  return clips.map((clip) => {
    if (clip.id !== clipId) return clip
    const nextClip: EditingVideoClip = { ...clip, treatment }
    if (treatment === 'punch-in') { nextClip.treatmentScale = getEditingClipTreatmentScale({ treatmentScale: scale }); nextClip.treatmentAnchor = getEditingClipTreatmentAnchor({ treatmentAnchor: anchor }) }
    else { delete nextClip.treatment; delete nextClip.treatmentScale; delete nextClip.treatmentAnchor }
    return nextClip
  })
}
