import { describe, expect, it } from 'vitest'
import { toggleVisionObjectDetectionSelection } from '../../src/core/ai/vision-object-detection-selection'

describe('vision object detection selection', () => {
  it('selects a candidate and toggles the same candidate off', () => {
    expect(toggleVisionObjectDetectionSelection(null, 1, 3)).toBe(1)
    expect(toggleVisionObjectDetectionSelection(1, 1, 3)).toBeNull()
  })

  it('moves selection to another valid candidate', () => {
    expect(toggleVisionObjectDetectionSelection(0, 2, 3)).toBe(2)
  })

  it('keeps the current selection for invalid indexes', () => {
    expect(toggleVisionObjectDetectionSelection(1, -1, 3)).toBe(1)
    expect(toggleVisionObjectDetectionSelection(1, 3, 3)).toBe(1)
    expect(toggleVisionObjectDetectionSelection(null, 0, 0)).toBeNull()
  })
})
