/** Ephemeral timeline selection. It is intentionally not persisted in an editing project. */
export type EditingSelection = {
  clipIds: readonly string[]
  captionIds: readonly string[]
  graphicIds: readonly string[]
  videoBlockIds: readonly string[]
}

export const EMPTY_EDITING_SELECTION: EditingSelection = {
  clipIds: [],
  captionIds: [],
  graphicIds: [],
  videoBlockIds: [],
}

export function editingSelectionCount(selection: EditingSelection): number {
  return selection.clipIds.length + selection.captionIds.length + selection.graphicIds.length + selection.videoBlockIds.length
}

export function hasEditingSelection(selection: EditingSelection): boolean {
  return editingSelectionCount(selection) > 0
}
