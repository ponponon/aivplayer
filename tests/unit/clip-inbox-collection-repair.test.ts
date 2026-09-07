import { describe, expect, it } from 'vitest'
import { createVisionClipCollectionRepairPlan } from '../../src/core/ai/clip-inbox-collection-repair'
import { createVisionSourceFingerprint } from '../../src/core/ai/vision-evidence'
import type { VisionClipCollection, VisionClipSelection } from '../../src/shared/vision-types'

const selection = (patch: Partial<VisionClipSelection> = {}): VisionClipSelection => ({
  sourceId: 'source-old',
  videoPath: '/old/demo.mp4',
  fileName: 'demo.mp4',
  fingerprint: '/old/demo.mp4:12',
  durationSeconds: 12,
  startSeconds: 1,
  endSeconds: 3,
  evidenceIds: [],
  evidenceTypes: ['subtitle'],
  ...patch
})

const collection = (patch: Partial<VisionClipCollection> = {}): VisionClipCollection => ({
  id: 'collection-1',
  title: '待修复集合',
  tags: [],
  sortMode: 'source-time',
  isFavorite: false,
  isArchived: false,
  createdAt: 1,
  updatedAt: 1,
  selections: [selection()],
  ...patch
})

describe('clip inbox collection repair', () => {
  it('matches one replacement by file name and keeps the plan read-only', () => {
    const source = collection()
    const plan = createVisionClipCollectionRepairPlan([source], new Set(), [{ path: '/new/demo.mp4', name: 'demo.mp4' }])

    expect(plan).toEqual({
      matches: [{
        collectionId: source.id,
        collectionTitle: source.title,
        missingPath: '/old/demo.mp4',
        missingFileName: 'demo.mp4',
        replacementPath: '/new/demo.mp4',
        replacementFileName: 'demo.mp4',
        status: 'matched',
        basis: 'name'
      }],
      matchedCount: 1,
      ambiguousCount: 0,
      unmatchedCount: 0
    })
    expect(source.selections[0]?.videoPath).toBe('/old/demo.mp4')
  })

  it('reports ambiguous and unmatched sources instead of guessing', () => {
    const source = collection({ selections: [selection(), selection({ videoPath: '/old/other.mp4', fileName: 'other.mp4' })] })
    const plan = createVisionClipCollectionRepairPlan([source], new Set(), [
      { path: '/new/demo-a.mp4', name: 'demo.mp4' },
      { path: '/new/demo-b.mp4', name: 'demo.mp4' }
    ])

    expect(plan.matches.map((match) => match.status)).toEqual(['ambiguous', 'unmatched'])
    expect(plan.matchedCount).toBe(0)
    expect(plan.ambiguousCount).toBe(1)
    expect(plan.unmatchedCount).toBe(1)
  })

  it('allows the same replacement path for the same missing source in multiple collections', () => {
    const first = collection({ id: 'collection-1', title: '集合一' })
    const second = collection({ id: 'collection-2', title: '集合二' })
    const plan = createVisionClipCollectionRepairPlan([first, second], new Set(), [{ path: '/new/demo.mp4', name: 'demo.mp4' }])

    expect(plan.matches).toHaveLength(2)
    expect(plan.matches.every((match) => match.status === 'matched' && match.replacementPath === '/new/demo.mp4' && match.basis === 'name')).toBe(true)
  })

  it('prefers a unique source fingerprint over file-name ambiguity', () => {
    const source = collection({ selections: [selection({ fingerprint: createVisionSourceFingerprint('/old/demo.mp4', 42, 1000) })] })
    const plan = createVisionClipCollectionRepairPlan([source], new Set(), [
      { path: '/new/renamed-a.mp4', name: 'renamed.mp4', fileSizeBytes: 42, fileMtimeMs: 1000, durationSeconds: 90 },
      { path: '/new/renamed-b.mp4', name: 'renamed.mp4', fileSizeBytes: 42, fileMtimeMs: 2000, durationSeconds: 12 }
    ])

    expect(plan.matches[0]).toMatchObject({
      replacementPath: '/new/renamed-a.mp4',
      replacementFileName: 'renamed.mp4',
      status: 'matched',
      basis: 'fingerprint'
    })
  })

  it('uses name and duration before a weaker name-only match', () => {
    const source = collection()
    const plan = createVisionClipCollectionRepairPlan([source], new Set(), [
      { path: '/new/demo-short.mp4', name: 'demo.mp4', durationSeconds: 8 },
      { path: '/new/demo.mp4', name: 'demo.mp4', durationSeconds: 12 }
    ])

    expect(plan.matches[0]).toMatchObject({
      replacementPath: '/new/demo.mp4',
      status: 'matched',
      basis: 'name-duration'
    })
  })

  it('uses one unique duration candidate when the source was renamed', () => {
    const source = collection()
    const plan = createVisionClipCollectionRepairPlan([source], new Set(), [
      { path: '/new/renamed.mp4', name: 'renamed.mp4', durationSeconds: 12 },
      { path: '/new/other.mp4', name: 'other.mp4', durationSeconds: 18 }
    ])

    expect(plan.matches[0]).toMatchObject({
      replacementPath: '/new/renamed.mp4',
      status: 'matched',
      basis: 'duration'
    })
  })
})
