import type { EditingClipTreatment, EditingTreatmentAnchor, EditingVideoClip } from '../../shared/editing-types'
import { getEditingClipTreatment, getEditingClipTreatmentAnchor, getEditingClipTreatmentScale, getEditingClipTreatmentSize, updateEditingClipTreatment } from './treatment-operations'
import { isEditingFramingTreatmentAllowed, type EditingFramingOrientation } from './framing-orientation'

export type EditingFramingPresetId = EditingClipTreatment

export type EditingFramingPreset = {
  id: EditingFramingPresetId
  treatment: EditingClipTreatment
  scale?: number
  anchor?: EditingTreatmentAnchor
  size?: number
}

/**
 * Pireel-style semantic shot recipes. The raw treatment picker remains available
 * for fine tuning; these recipes reset a shot to a predictable editorial baseline.
 */
export const EDITING_FRAMING_PRESETS: readonly EditingFramingPreset[] = [
  { id: 'full', treatment: 'full' },
  { id: 'punch-in', treatment: 'punch-in', scale: 1.35, anchor: 'center' },
  { id: 'corner-br', treatment: 'corner-br', size: 35 },
  { id: 'corner-tl', treatment: 'corner-tl', size: 35 },
  { id: 'split-left', treatment: 'split-left', size: 50 },
  { id: 'split-right', treatment: 'split-right', size: 50 }
]

export function getEditingFramingPreset(id: EditingFramingPresetId): EditingFramingPreset {
  return EDITING_FRAMING_PRESETS.find((preset) => preset.id === id) ?? EDITING_FRAMING_PRESETS[0]!
}

export function isEditingFramingPresetAllowed(preset: EditingFramingPreset, orientation: EditingFramingOrientation): boolean {
  return isEditingFramingTreatmentAllowed(preset.treatment, orientation)
}

function sameNumber(left: number, right: number): boolean {
  return Math.abs(left - right) < 0.001
}

export function isEditingFramingPresetActive(clip: Pick<EditingVideoClip, 'treatment' | 'treatmentScale' | 'treatmentAnchor' | 'treatmentSize'>, preset: EditingFramingPreset): boolean {
  if (getEditingClipTreatment(clip) !== preset.treatment) return false
  if (preset.treatment === 'full') return true
  if (preset.treatment === 'punch-in') return sameNumber(getEditingClipTreatmentScale(clip), preset.scale ?? 1.35) && getEditingClipTreatmentAnchor(clip) === (preset.anchor ?? 'center')
  return sameNumber(getEditingClipTreatmentSize(clip), preset.size ?? getEditingClipTreatmentSize({ treatment: preset.treatment }))
}

export function applyEditingFramingPreset(clips: readonly EditingVideoClip[], clipIds: readonly string[], presetId: EditingFramingPresetId): EditingVideoClip[] {
  if (clipIds.length === 0) return [...clips]
  const targetIds = new Set(clipIds)
  const preset = getEditingFramingPreset(presetId)
  return clips.map((clip) => {
    if (!targetIds.has(clip.id)) return clip
    return updateEditingClipTreatment([clip], clip.id, preset.treatment, preset.scale, preset.anchor, preset.size)[0] ?? clip
  })
}
