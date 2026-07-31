import { describe, expect, it } from 'vitest'
import { createEditingProject } from '../../src/core/editing/project'
import { getEditingOverlayTrackOrder, reorderEditingOverlayTracks } from '../../src/core/editing/overlay-track-operations'

const project = createEditingProject({ id: 'source', path: '/tmp/demo.mp4', name: 'demo.mp4', fingerprint: 'demo', durationSeconds: 10 }, { now: 100 })

describe('overlay track operations', () => {
  it('keeps old projects on the default back-to-front order', () => {
    expect(getEditingOverlayTrackOrder(undefined)).toEqual(['videoBlocks', 'graphics', 'captions'])
    expect(getEditingOverlayTrackOrder(['captions', 'captions'])).toEqual(['captions', 'videoBlocks', 'graphics'])
  })

  it('moves a track before the drop target and records the changed project', () => {
    const next = reorderEditingOverlayTracks({ ...project, overlayTrackOrder: ['videoBlocks', 'graphics', 'captions'] }, 'captions', 'videoBlocks')
    expect(next.overlayTrackOrder).toEqual(['captions', 'videoBlocks', 'graphics'])
    expect(next.updatedAt).toBeGreaterThanOrEqual(100)
    expect(reorderEditingOverlayTracks(next, 'captions', 'captions')).toBe(next)
  })
})
