import { describe, expect, it } from 'vitest'
import {
  normalizeSidePanelWidth,
  SIDE_PANEL_WIDTH_DEFAULT,
  SIDE_PANEL_WIDTH_MAX,
  SIDE_PANEL_WIDTH_MIN
} from '../../src/shared/app-settings'

describe('side panel width', () => {
  it('normalizes persisted and dragged widths to the supported range', () => {
    expect(normalizeSidePanelWidth(undefined)).toBe(SIDE_PANEL_WIDTH_DEFAULT)
    expect(normalizeSidePanelWidth(239)).toBe(SIDE_PANEL_WIDTH_MIN)
    expect(normalizeSidePanelWidth(361.4)).toBe(361)
    expect(normalizeSidePanelWidth(999)).toBe(SIDE_PANEL_WIDTH_MAX)
  })
})
