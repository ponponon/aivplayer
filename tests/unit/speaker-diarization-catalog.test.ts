import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { applySpeakerDiarizationCatalogToResults, createDefaultSpeakerDiarizationCatalog, filterSpeakerDiarizationCatalogSearchResults, getDefaultSpeakerName, getSpeakerDiarizationCatalogSearchQueries, updateSpeakerDiarizationCatalog } from '../../src/core/ai/speaker-diarization-catalog'
import { getSpeakerDiarizationCatalogPath, SpeakerDiarizationCatalogStore } from '../../src/core/ai/speaker-diarization-catalog-store'
import type { VisionSearchResult } from '../../src/shared/vision-types'

function speakerResult(patch: Partial<VisionSearchResult> = {}): VisionSearchResult {
  return {
    id: 'speaker-evidence-1',
    videoPath: '/videos/demo.mp4',
    fileName: 'demo.mp4',
    timestampSeconds: 2,
    thumbnailPath: '',
    score: 0.8,
    matchedText: '说话人 1 / Speaker 1',
    evidenceType: 'speaker',
    sourceFingerprint: 'demo:100:200',
    modelId: 'sherpa-onnx-speaker-diarization',
    modelVariant: '1.13.4',
    ...patch
  }
}

describe('speaker diarization catalog', () => {
  const tempDirectories: string[] = []

  afterEach(async () => {
    await Promise.all(tempDirectories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })))
  })

  it('keeps labels isolated by source fingerprint and projects them to search results', () => {
    let catalog = createDefaultSpeakerDiarizationCatalog(1)
    catalog = updateSpeakerDiarizationCatalog(catalog, {
      sourceFingerprint: 'demo:100:200',
      videoPath: '/videos/demo.mp4',
      fileName: 'demo.mp4',
      speakerId: 0,
      name: '张老师',
      aliases: ['张老师', '主讲人']
    }, 2)
    catalog = updateSpeakerDiarizationCatalog(catalog, {
      sourceFingerprint: 'other:100:200',
      videoPath: '/videos/other.mp4',
      fileName: 'other.mp4',
      speakerId: 0,
      name: '另一位说话人'
    }, 3)

    expect(getDefaultSpeakerName(0)).toBe('说话人 1 / Speaker 1')
    expect(applySpeakerDiarizationCatalogToResults([speakerResult()], catalog)[0]?.matchedText).toBe('张老师')
    expect(applySpeakerDiarizationCatalogToResults([speakerResult({ sourceFingerprint: 'missing' })], catalog)[0]?.matchedText).toBe('说话人 1 / Speaker 1')
    expect(getSpeakerDiarizationCatalogSearchQueries('主讲人', catalog)).toEqual([{
      query: '说话人 1 / Speaker 1',
      sourceFingerprints: ['demo:100:200'],
      speakerIds: [0]
    }])
  })

  it('keeps same labels isolated when speaker ids differ across sources', () => {
    let catalog = createDefaultSpeakerDiarizationCatalog(1)
    catalog = updateSpeakerDiarizationCatalog(catalog, { sourceFingerprint: 'source-a', videoPath: '/videos/a.mp4', fileName: 'a.mp4', speakerId: 0, name: '主持人' }, 2)
    catalog = updateSpeakerDiarizationCatalog(catalog, { sourceFingerprint: 'source-b', videoPath: '/videos/b.mp4', fileName: 'b.mp4', speakerId: 1, name: '主持人' }, 3)

    const queries = getSpeakerDiarizationCatalogSearchQueries('主持人', catalog)
    expect(queries).toEqual([
      { query: '说话人 1 / Speaker 1', sourceFingerprints: ['source-a'], speakerIds: [0] },
      { query: '说话人 2 / Speaker 2', sourceFingerprints: ['source-b'], speakerIds: [1] }
    ])
    expect(filterSpeakerDiarizationCatalogSearchResults([
      speakerResult({ sourceFingerprint: 'source-a', matchedText: '说话人 1 / Speaker 1' }),
      speakerResult({ id: 'speaker-evidence-2', sourceFingerprint: 'source-a', matchedText: '说话人 2 / Speaker 2' }),
      speakerResult({ id: 'speaker-evidence-3', sourceFingerprint: 'source-b', matchedText: '说话人 1 / Speaker 1' }),
      speakerResult({ id: 'speaker-evidence-4', sourceFingerprint: 'source-b', matchedText: '说话人 2 / Speaker 2' })
    ], queries[0]!)).toHaveLength(1)
    expect(filterSpeakerDiarizationCatalogSearchResults([
      speakerResult({ sourceFingerprint: 'source-a', matchedText: '说话人 1 / Speaker 1' }),
      speakerResult({ id: 'speaker-evidence-2', sourceFingerprint: 'source-b', matchedText: '说话人 2 / Speaker 2' })
    ], queries[1]!)).toHaveLength(1)
  })

  it('rejects duplicate labels within one source without changing the catalog', () => {
    let catalog = createDefaultSpeakerDiarizationCatalog(1)
    catalog = updateSpeakerDiarizationCatalog(catalog, { sourceFingerprint: 'demo', videoPath: '/videos/demo.mp4', fileName: 'demo.mp4', speakerId: 0, name: '甲' }, 2)
    const unchanged = updateSpeakerDiarizationCatalog(catalog, { sourceFingerprint: 'demo', videoPath: '/videos/demo.mp4', fileName: 'demo.mp4', speakerId: 1, name: '甲' }, 3)
    expect(unchanged).toEqual(catalog)
  })

  it('persists labels atomically and restores them after a new store is opened', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'aivplayer-speaker-catalog-'))
    tempDirectories.push(directory)
    const first = new SpeakerDiarizationCatalogStore(directory)
    first.update({ sourceFingerprint: 'demo', videoPath: '/videos/demo.mp4', fileName: 'demo.mp4', speakerId: 1, name: '采访对象', aliases: ['嘉宾'] })
    await first.flush()

    const second = new SpeakerDiarizationCatalogStore(directory)
    expect(second.get().sources[0]?.entries[0]).toEqual({ speakerId: 1, name: '采访对象', aliases: ['嘉宾'] })
    expect(await readFile(getSpeakerDiarizationCatalogPath(directory), 'utf8')).toContain('采访对象')
  })
})
