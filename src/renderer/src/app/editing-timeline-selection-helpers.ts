import type { EditingSelection } from '../../../core/editing/selection'
import type { EditingProject } from '../../../shared/editing-types'
import type { AppModel } from './app-types'

export type SelectionKind = 'clip' | 'caption' | 'graphic' | 'videoBlock'
export type SelectionKey = 'clipIds' | 'captionIds' | 'graphicIds' | 'videoBlockIds'
export type TimelineSelection = Record<SelectionKey, Set<string>>
export type TimelineMarquee = { startX: number; startY: number; currentX: number; currentY: number; additive: boolean; moved: boolean }
export type EditingTimelineApp = AppModel & {
  selectEditingClip: (clipId: string) => void
  selectEditingCaption: (captionId: string) => void
  selectEditingGraphic: (graphicId: string) => void
  selectEditingVideoBlock: (blockId: string) => void
  deleteEditingSelection: (selection: EditingSelection) => void
  duplicateEditingSelection: (selection: EditingSelection) => EditingSelection | null
  moveEditingSelection: (selection: EditingSelection, deltaSeconds: number) => void
}

export const emptyEditingTimelineSelection = (): TimelineSelection => ({ clipIds: new Set(), captionIds: new Set(), graphicIds: new Set(), videoBlockIds: new Set() })

export function selectionKey(kind: SelectionKind): SelectionKey {
  return `${kind}Ids` as SelectionKey
}

export function selectPrimaryEditingItem(app: EditingTimelineApp, kind: SelectionKind, id: string | null): void {
  if (kind === 'clip') app.setEditingSelectedClipId(id)
  else if (kind === 'caption') app.setEditingSelectedCaptionId(id)
  else if (kind === 'graphic') app.setEditingSelectedGraphicId(id)
  else app.setEditingSelectedVideoBlockId(id)
}

export function clearPrimaryEditingItem(app: EditingTimelineApp): void {
  app.setEditingSelectedClipId(null); app.setEditingSelectedCaptionId(null); app.setEditingSelectedGraphicId(null); app.setEditingSelectedVideoBlockId(null)
}

export function firstEditingTimelineSelection(selection: TimelineSelection): { kind: SelectionKind; id: string } | null {
  for (const [kind, key] of [['clip', 'clipIds'], ['caption', 'captionIds'], ['graphic', 'graphicIds'], ['videoBlock', 'videoBlockIds']] as const) {
    const id = [...selection[key]][0]
    if (id) return { kind, id }
  }
  return null
}

export function selectAllEditingTimelineItems(project: EditingProject): TimelineSelection {
  return {
    clipIds: new Set(project.videoClips.map((clip) => clip.id)),
    captionIds: new Set(project.captions.map((caption) => caption.id)),
    graphicIds: new Set((project.graphics ?? []).map((graphic) => graphic.id)),
    videoBlockIds: new Set((project.videoBlocks ?? []).map((block) => block.id)),
  }
}
