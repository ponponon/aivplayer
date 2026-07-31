import { describe, expect, it } from 'vitest'
import { createEditingGraphic, findActiveEditingGraphics, removeEditingGraphic, updateEditingGraphic } from '../../src/core/editing/graphic-operations'
import { getEditingGraphicTransform, updateEditingGraphicTransform } from '../../src/core/editing/graphic-layout'

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

  it('supports a persisted free transform while keeping preset projects compatible', () => {
    const graphic = createEditingGraphic('title', 0, 8, { id: 'graphic-1' })!
    expect(getEditingGraphicTransform(graphic)).toMatchObject({ xPercent: 50, yPercent: 50, widthPercent: 58, rotationDegrees: 0 })
    expect(updateEditingGraphicTransform(graphic, 'move', 12, -8)).toMatchObject({ xPercent: 62, yPercent: 42 })
    expect(updateEditingGraphicTransform({ ...graphic, xPercent: 48, widthPercent: 30 }, 'resize-left', 8)).toMatchObject({ xPercent: 52, widthPercent: 22 })
    expect(updateEditingGraphicTransform({ ...graphic, xPercent: 48, widthPercent: 30 }, 'resize-right', 8)).toMatchObject({ xPercent: 52, widthPercent: 38 })
    expect(updateEditingGraphicTransform(graphic, 'rotate', 15)).toMatchObject({ rotationDegrees: 15 })
    const moved = updateEditingGraphic([graphic], graphic.id, { xPercent: 62, yPercent: 42, widthPercent: 58, rotationDegrees: 12 }, 8)[0]
    expect(moved).toMatchObject({ xPercent: 62, yPercent: 42, widthPercent: 58, rotationDegrees: 12 })
    const resetByPosition = updateEditingGraphic([moved], graphic.id, { position: 'top-left' }, 8)[0]
    expect(resetByPosition).not.toHaveProperty('xPercent')
    expect(resetByPosition).not.toHaveProperty('rotationDegrees')
  })
})
