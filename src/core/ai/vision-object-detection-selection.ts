/** Returns the next selected detection index, or null when the active item is toggled off. */
export function toggleVisionObjectDetectionSelection(
  currentIndex: number | null,
  nextIndex: number,
  detectionCount: number
): number | null {
  if (!Number.isInteger(nextIndex) || nextIndex < 0 || nextIndex >= detectionCount) return currentIndex
  return currentIndex === nextIndex ? null : nextIndex
}
