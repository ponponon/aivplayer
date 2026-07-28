import type { EditingVideoClip } from '../../shared/editing-types'

export type EditingClipAudio = Pick<EditingVideoClip, 'volume' | 'muted'>

export function getEditingClipVolume(clip: EditingClipAudio): number {
  return Math.min(1, Math.max(0, Number.isFinite(clip.volume) ? clip.volume ?? 1 : 1))
}

export function isEditingClipMuted(clip: EditingClipAudio): boolean {
  return Boolean(clip.muted) || getEditingClipVolume(clip) === 0
}

export function updateEditingClipVolume(clips: readonly EditingVideoClip[], clipId: string, volume: number): EditingVideoClip[] {
  const nextVolume = Math.min(1, Math.max(0, Number.isFinite(volume) ? volume : 1))
  return clips.map((clip) => clip.id === clipId ? { ...clip, volume: nextVolume, muted: nextVolume === 0 } : clip)
}

export function toggleEditingClipMuted(clips: readonly EditingVideoClip[], clipId: string): EditingVideoClip[] {
  return clips.map((clip) => {
    if (clip.id !== clipId) return clip
    if (isEditingClipMuted(clip)) return { ...clip, volume: getEditingClipVolume(clip) || 1, muted: false }
    return { ...clip, muted: true }
  })
}
