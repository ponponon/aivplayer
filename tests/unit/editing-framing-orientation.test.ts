import { describe, expect, it } from 'vitest'
import { getEditingFramingOrientation, isEditingFramingTreatmentAllowed, isEditingFramingTreatmentRecommended } from '../../src/core/editing/framing-orientation'

describe('editing framing orientation rules', () => {
  it('classifies portrait, landscape, square and invalid dimensions deterministically', () => {
    expect(getEditingFramingOrientation(1080, 1920)).toBe('portrait')
    expect(getEditingFramingOrientation(1920, 1080)).toBe('landscape')
    expect(getEditingFramingOrientation(1080, 1080)).toBe('landscape')
    expect(getEditingFramingOrientation(undefined, undefined)).toBe('landscape')
  })

  it('allows corner treatments only in portrait and split treatments only in landscape', () => {
    expect(isEditingFramingTreatmentAllowed('corner-br', 'portrait')).toBe(true)
    expect(isEditingFramingTreatmentAllowed('corner-tl', 'landscape')).toBe(false)
    expect(isEditingFramingTreatmentAllowed('split-left', 'landscape')).toBe(true)
    expect(isEditingFramingTreatmentAllowed('split-right', 'portrait')).toBe(false)
    expect(isEditingFramingTreatmentAllowed('punch-in', 'portrait')).toBe(true)
    expect(isEditingFramingTreatmentRecommended('corner-br', 'portrait')).toBe(true)
    expect(isEditingFramingTreatmentRecommended('full', 'portrait')).toBe(false)
  })
})
