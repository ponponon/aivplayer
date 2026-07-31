export const EDITING_SOURCE_DRAG_TYPE = 'application/x-aivplayer-editing-source'

export function writeEditingSourceDrag(event: React.DragEvent<HTMLElement>, sourceId: string): void {
  event.dataTransfer.effectAllowed = 'copy'
  event.dataTransfer.setData(EDITING_SOURCE_DRAG_TYPE, sourceId)
}

export function readEditingSourceDrag(event: React.DragEvent<HTMLElement>): string | null {
  const sourceId = event.dataTransfer.getData(EDITING_SOURCE_DRAG_TYPE).trim()
  return sourceId || null
}
