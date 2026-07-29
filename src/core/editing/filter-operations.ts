import type { EditingClipFilter, EditingVideoClip } from '../../shared/editing-types'

const FILTER_MIN = 0.5
const FILTER_MAX = 1.5
const FILTER_DEFAULT = 1

function clampFilterValue(value: number | undefined): number {
  return value !== undefined && Number.isFinite(value) ? Math.min(FILTER_MAX, Math.max(FILTER_MIN, value)) : FILTER_DEFAULT
}

export function getEditingClipFilter(clip: Pick<EditingVideoClip, 'filter'>): Required<EditingClipFilter> {
  return { brightness: clampFilterValue(clip.filter?.brightness), contrast: clampFilterValue(clip.filter?.contrast), saturate: clampFilterValue(clip.filter?.saturate) }
}

export function isEditingClipFilterNeutral(clip: Pick<EditingVideoClip, 'filter'>): boolean {
  const filter = getEditingClipFilter(clip)
  return filter.brightness === FILTER_DEFAULT && filter.contrast === FILTER_DEFAULT && filter.saturate === FILTER_DEFAULT
}

export function buildEditingClipFilterCss(clip: Pick<EditingVideoClip, 'filter'>): string {
  const filter = getEditingClipFilter(clip)
  return `brightness(${filter.brightness}) contrast(${filter.contrast}) saturate(${filter.saturate})`
}

export function updateEditingClipFilter(clips: readonly EditingVideoClip[], clipId: string, filter: EditingClipFilter): EditingVideoClip[] {
  return clips.map((clip) => {
    if (clip.id !== clipId) return clip
    const nextClip: EditingVideoClip = { ...clip }
    if (isEditingClipFilterNeutral({ filter })) delete nextClip.filter
    else nextClip.filter = getEditingClipFilter({ filter })
    return nextClip
  })
}
