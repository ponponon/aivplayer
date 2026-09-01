import { useEffect, useState, type KeyboardEvent, type PointerEvent, type RefObject } from 'react'
import { editingSelectionCount, type EditingSelection } from '../../../core/editing/selection'
import type { EditingProject } from '../../../shared/editing-types'
import { clearPrimaryEditingItem, emptyEditingTimelineSelection, firstEditingTimelineSelection, selectAllEditingTimelineItems, selectPrimaryEditingItem, selectionKey, type EditingTimelineApp, type SelectionKind, type TimelineMarquee, type TimelineSelection } from './editing-timeline-selection-helpers'
export function useEditingTimelineSelection(
  app: EditingTimelineApp,
  project: EditingProject | null,
  timelineContentRef: RefObject<HTMLDivElement | null>
): {
  selection: TimelineSelection
  selectionCount: number
  selectionPayload: () => EditingSelection
  marquee: TimelineMarquee | null
  selectTimelineItem: (kind: SelectionKind, id: string, additive?: boolean) => void
  removeTimelineItemFromSelection: (kind: SelectionKind, id: string) => void
  clearTimelineSelection: () => void
  deleteTimelineSelection: () => void
  duplicateTimelineSelection: () => void
  beginTimelineMarquee: (event: PointerEvent<HTMLDivElement>) => void
  moveTimelineMarquee: (event: PointerEvent<HTMLDivElement>) => void
  finishTimelineMarquee: (event: PointerEvent<HTMLDivElement>) => void
  handleTimelineKeyDown: (event: KeyboardEvent<HTMLDivElement>) => void
} {
  const [selection, setSelection] = useState<TimelineSelection>(emptyEditingTimelineSelection)
  const [marquee, setMarquee] = useState<TimelineMarquee | null>(null)
  useEffect(() => {
    if (!project) return
    setSelection((current) => {
      const next: TimelineSelection = {
        clipIds: new Set([...current.clipIds].filter((id) => project.videoClips.some((clip) => clip.id === id))),
        captionIds: new Set([...current.captionIds].filter((id) => project.captions.some((caption) => caption.id === id))),
        graphicIds: new Set([...current.graphicIds].filter((id) => project.graphics?.some((graphic) => graphic.id === id))),
        videoBlockIds: new Set([...current.videoBlockIds].filter((id) => project.videoBlocks?.some((block) => block.id === id))),
      }
      const currentCount = current.clipIds.size + current.captionIds.size + current.graphicIds.size + current.videoBlockIds.size
      if (currentCount === 0) {
        if (app.editingSelectedClipId && project.videoClips.some((clip) => clip.id === app.editingSelectedClipId)) next.clipIds.add(app.editingSelectedClipId)
        if (app.editingSelectedCaptionId && project.captions.some((caption) => caption.id === app.editingSelectedCaptionId)) next.captionIds.add(app.editingSelectedCaptionId)
        if (app.editingSelectedGraphicId && project.graphics?.some((graphic) => graphic.id === app.editingSelectedGraphicId)) next.graphicIds.add(app.editingSelectedGraphicId)
        if (app.editingSelectedVideoBlockId && project.videoBlocks?.some((block) => block.id === app.editingSelectedVideoBlockId)) next.videoBlockIds.add(app.editingSelectedVideoBlockId)
      }
      return next
    })
  }, [app.editingSelectedCaptionId, app.editingSelectedClipId, app.editingSelectedGraphicId, app.editingSelectedVideoBlockId, project?.id, project?.videoClips, project?.captions, project?.graphics, project?.videoBlocks])
  const selectionCount = selection.clipIds.size + selection.captionIds.size + selection.graphicIds.size + selection.videoBlockIds.size
  const selectionPayload = (): EditingSelection => ({ clipIds: [...selection.clipIds], captionIds: [...selection.captionIds], graphicIds: [...selection.graphicIds], videoBlockIds: [...selection.videoBlockIds] })

  const selectTimelineItem = (kind: SelectionKind, id: string, additive = false): void => {
    const next: TimelineSelection = {
      clipIds: new Set(selection.clipIds),
      captionIds: new Set(selection.captionIds),
      graphicIds: new Set(selection.graphicIds),
      videoBlockIds: new Set(selection.videoBlockIds),
    }
    const ids = next[selectionKey(kind)]
    if (!additive) {
      next.clipIds.clear(); next.captionIds.clear(); next.graphicIds.clear(); next.videoBlockIds.clear(); ids.add(id)
      setSelection(next)
      clearPrimaryEditingItem(app)
      if (kind === 'clip') app.selectEditingClip(id)
      else if (kind === 'caption') app.selectEditingCaption(id)
      else if (kind === 'graphic') app.selectEditingGraphic(id)
      else app.selectEditingVideoBlock(id)
      return
    }
    if (ids.has(id)) ids.delete(id)
    else ids.add(id)
    setSelection(next)
    selectPrimaryEditingItem(app, kind, ids.has(id) ? id : [...ids].at(-1) ?? null)
  }

  const removeTimelineItemFromSelection = (kind: SelectionKind, id: string): void => {
    const key = selectionKey(kind)
    setSelection((current) => ({ ...current, [key]: new Set([...current[key]].filter((item) => item !== id)) }))
  }

  const clearTimelineSelection = (): void => {
    setSelection(emptyEditingTimelineSelection())
    clearPrimaryEditingItem(app)
  }

  const deleteTimelineSelection = (): void => {
    const payload = selectionPayload()
    if (editingSelectionCount(payload) === 0) return
    app.deleteEditingSelection(payload)
    setSelection(emptyEditingTimelineSelection())
  }

  const duplicateTimelineSelection = (): void => {
    const nextPayload = app.duplicateEditingSelection(selectionPayload()); if (!nextPayload) return
    const next: TimelineSelection = { clipIds: new Set(nextPayload.clipIds), captionIds: new Set(nextPayload.captionIds), graphicIds: new Set(nextPayload.graphicIds), videoBlockIds: new Set(nextPayload.videoBlockIds) }; setSelection(next)
    const first = firstEditingTimelineSelection(next); if (first) selectPrimaryEditingItem(app, first.kind, first.id)
  }

  const selectAllTimelineItems = (): void => {
    if (!project) return
    const next = selectAllEditingTimelineItems(project)
    setSelection(next)
    const first = firstEditingTimelineSelection(next)
    if (first) selectPrimaryEditingItem(app, first.kind, first.id)
  }

  const beginTimelineMarquee = (event: PointerEvent<HTMLDivElement>): void => {
    if (event.button !== 0 || event.target instanceof Element && event.target.closest('button, input, select, textarea')) return
    if (!(event.target instanceof Element) || !event.target.closest('.editing-caption-track, .editing-graphic-track, .editing-video-block-track')) return
    setMarquee({ startX: event.clientX, startY: event.clientY, currentX: event.clientX, currentY: event.clientY, additive: event.metaKey || event.ctrlKey, moved: false })
    event.currentTarget.setPointerCapture(event.pointerId)
    event.preventDefault()
  }

  const moveTimelineMarquee = (event: PointerEvent<HTMLDivElement>): void => {
    if (!marquee) return
    const moved = marquee.moved || Math.abs(event.clientX - marquee.startX) > 4 || Math.abs(event.clientY - marquee.startY) > 4
    setMarquee({ ...marquee, currentX: event.clientX, currentY: event.clientY, moved })
    event.preventDefault()
  }

  const finishTimelineMarquee = (event: PointerEvent<HTMLDivElement>): void => {
    if (!marquee) return
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId)
    const active = marquee
    setMarquee(null)
    if (!active.moved) { clearTimelineSelection(); return }
    const left = Math.min(active.startX, active.currentX); const right = Math.max(active.startX, active.currentX); const top = Math.min(active.startY, active.currentY); const bottom = Math.max(active.startY, active.currentY)
    const hit: TimelineSelection = emptyEditingTimelineSelection()
    timelineContentRef.current?.querySelectorAll<HTMLElement>('[data-editing-selection-kind][data-editing-selection-id]').forEach((element) => {
      const rect = element.getBoundingClientRect()
      if (rect.right < left || rect.left > right || rect.bottom < top || rect.top > bottom) return
      const id = element.dataset.editingSelectionId; const kind = element.dataset.editingSelectionKind as SelectionKind
      if (id && ['clip', 'caption', 'graphic', 'videoBlock'].includes(kind)) hit[selectionKey(kind)].add(id)
    })
    const next: TimelineSelection = active.additive ? {
      clipIds: new Set([...selection.clipIds, ...hit.clipIds]), captionIds: new Set([...selection.captionIds, ...hit.captionIds]), graphicIds: new Set([...selection.graphicIds, ...hit.graphicIds]), videoBlockIds: new Set([...selection.videoBlockIds, ...hit.videoBlockIds])
    } : hit
    setSelection(next)
    const first = firstEditingTimelineSelection(next)
    if (first) selectPrimaryEditingItem(app, first.kind, first.id)
    else clearPrimaryEditingItem(app)
  }

  const handleTimelineKeyDown = (event: KeyboardEvent<HTMLDivElement>): void => {
    const target = event.target
    if (target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement || target instanceof HTMLSelectElement || target instanceof HTMLElement && Boolean(target.closest('.app-select, .app-select-menu'))) return
    if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'a') { event.preventDefault(); selectAllTimelineItems(); return }
    if ((event.metaKey || event.ctrlKey) && !event.altKey && event.key.toLowerCase() === 'd') { event.preventDefault(); duplicateTimelineSelection(); return }
    if (selectionCount > 0 && (event.key === 'Delete' || event.key === 'Backspace')) { event.preventDefault(); deleteTimelineSelection() }
  }

  return { selection, selectionCount, selectionPayload, marquee, selectTimelineItem, removeTimelineItemFromSelection, clearTimelineSelection, deleteTimelineSelection, duplicateTimelineSelection, beginTimelineMarquee, moveTimelineMarquee, finishTimelineMarquee, handleTimelineKeyDown }
}
