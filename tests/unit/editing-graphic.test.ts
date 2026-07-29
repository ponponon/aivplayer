import { describe, expect, it } from 'vitest'
import { createEditingGraphic, findActiveEditingGraphics, removeEditingGraphic, updateEditingGraphic } from '../../src/core/editing/graphic-operations'

describe('editing graphic operations', () => {
  it('creates a clamped text card on the current edited timeline', () => {
    const graphic = createEditingGraphic('  title  ', 9, 10, { durationSeconds: 4, position: 'top-left', style: 'label', id: 'graphic-1' })
    expect(graphic).toEqual({ id: 'graphic-1', startSeconds: 9, durationSeconds: 1, text: 'title', position: 'top-left', style: 'label' })
  })

  it('finds active cards and updates or removes only the requested card', () => {
    const first = createEditingGraphic('first', 0, 8, { id: 'graphic-1', durationSeconds: 4 })!
    const second = createEditingGraphic('second', 3, 8, { id: 'graphic-2' })!
    expect(findActiveEditingGraphics([first, second], 3.5).map((graphic) => graphic.id)).toEqual(['graphic-1', 'graphic-2'])
    const updated = updateEditingGraphic([first, second], 'graphic-2', { text: 'changed', position: 'bottom-right' }, 8)
    expect(updated[1]).toMatchObject({ text: 'changed', position: 'bottom-right' })
    expect(updateEditingGraphic(updated, 'graphic-2', { startSeconds: 5, durationSeconds: 2 }, 8)[1]).toMatchObject({ startSeconds: 5, durationSeconds: 2 })
    expect(removeEditingGraphic(updated, 'graphic-1')).toEqual([updated[1]])
  })
})
