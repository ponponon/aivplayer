import { describe, expect, it } from 'vitest'
import { renderVisionClipCollectionExport, renderVisionClipCollectionsExport } from '../../src/core/ai/clip-inbox-export'
import type { VisionClipCollection } from '../../src/shared/vision-types'

const collection: VisionClipCollection = {
  id: 'collection-1',
  title: '海边, 第一集',
  tags: ['海边'],
  sortMode: 'source-time',
  isFavorite: true,
  isArchived: true,
  createdAt: 1,
  updatedAt: 2,
  selections: [{
    sourceId: 'source-demo',
    videoPath: '/videos/demo.mp4',
    fileName: 'demo.mp4',
    fingerprint: 'fingerprint',
    durationSeconds: 12,
    startSeconds: 1,
    endSeconds: 3.5,
    evidenceIds: ['cue-1'],
    text: '第一句, 带逗号',
    evidenceTypes: ['subtitle']
  }]
}

describe('clip inbox export', () => {
  it('renders versioned JSON', () => {
    const output = renderVisionClipCollectionExport(collection, 'json')
    expect(JSON.parse(output)).toMatchObject({ exportVersion: 1, collection: { title: collection.title, tags: ['海边'], isFavorite: true, isArchived: true } })
  })

  it('renders a versioned multi-collection JSON export', () => {
    const output = renderVisionClipCollectionsExport([collection, { ...collection, id: 'collection-2', title: '第二组' }])
    expect(JSON.parse(output)).toMatchObject({ exportVersion: 2, collections: [{ id: 'collection-1' }, { id: 'collection-2', title: '第二组' }] })
  })

  it('escapes CSV fields', () => {
    const output = renderVisionClipCollectionExport(collection, 'csv')
    expect(output).toContain('index,source_id,video_path')
    expect(output).toContain('"第一句, 带逗号"')
  })

  it('renders CMX3600 timecodes and source notes', () => {
    const output = renderVisionClipCollectionExport(collection, 'edl', 30)
    expect(output).toContain('TITLE: 海边, 第一集')
    expect(output).toContain('FCM: NON-DROP FRAME')
    expect(output).toContain('001  AX       V     C        00:00:01:00 00:00:03:15 00:00:00:00 00:00:02:15')
    expect(output).toContain('* SOURCE FILE: /videos/demo.mp4')
  })
})
