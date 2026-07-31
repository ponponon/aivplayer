import { getEditingPersonMatteSettings } from './person-matte'
import type { EditingPersonMatte, EditingVideoClip } from '../../shared/editing-types'

export function isEditingPersonMatteNeutral(clip: Pick<EditingVideoClip, 'personMatte'>): boolean {
  const settings = getEditingPersonMatteSettings(clip.personMatte)
  return !settings.enabled && settings.featherPercent === 0 && settings.outlineWidthPercent === 0 && settings.outlineColor === '#ffffff'
}

export function updateEditingClipPersonMatte(clips: readonly EditingVideoClip[], clipId: string, personMatte: EditingPersonMatte): EditingVideoClip[] {
  return clips.map((clip) => {
    if (clip.id !== clipId) return clip
    const settings = getEditingPersonMatteSettings(personMatte)
    const nextClip: EditingVideoClip = { ...clip }
    if (isEditingPersonMatteNeutral({ personMatte: settings })) delete nextClip.personMatte
    else nextClip.personMatte = settings
    return nextClip
  })
}
