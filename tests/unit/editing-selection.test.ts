import { describe, expect, it } from 'vitest'
import { editingSelectionCount, hasEditingSelection, type EditingSelection } from '../../src/core/editing/selection'

describe('editing timeline selection', () => {
  it('counts selected primary and overlay elements across tracks', () => {
    const selection: EditingSelection = {
      clipIds: ['clip-a', 'clip-b'],
      captionIds: ['caption-a'],
      graphicIds: [],
      videoBlockIds: ['block-a'],
    }
    expect(editingSelectionCount(selection)).toBe(4)
    expect(hasEditingSelection(selection)).toBe(true)
    expect(hasEditingSelection({ clipIds: [], captionIds: [], graphicIds: [], videoBlockIds: [] })).toBe(false)
  })
})
