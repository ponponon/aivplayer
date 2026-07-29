import { describe, expect, it } from 'vitest'
import type { EditingVideoClip } from '../../src/shared/editing-types'
import { buildEditingClipFilterCss, getEditingClipFilter, isEditingClipFilterNeutral, updateEditingClipFilter } from '../../src/core/editing/filter-operations'

const clip: EditingVideoClip = { id: 'clip-1', sourceId: 'source-1', sourceStartSeconds: 0, sourceEndSeconds: 4 }

describe('editing clip filter operations', () => {
  it('defaults to neutral CSS and clamps values', () => {
    expect(getEditingClipFilter(clip)).toEqual({ brightness: 1, contrast: 1, saturate: 1 })
    expect(isEditingClipFilterNeutral(clip)).toBe(true)
    expect(getEditingClipFilter({ filter: { brightness: 9 } }).brightness).toBe(1.5)
  })

  it('persists non-neutral filters and removes them when reset', () => {
    const filtered = updateEditingClipFilter([clip], clip.id, { brightness: 1.2, contrast: 0.9 })
    expect(filtered[0]).toMatchObject({ filter: { brightness: 1.2, contrast: 0.9, saturate: 1 } })
    expect(buildEditingClipFilterCss(filtered[0]!)).toBe('brightness(1.2) contrast(0.9) saturate(1)')
    expect(updateEditingClipFilter(filtered, clip.id, {})[0]).toEqual(clip)
  })
})
