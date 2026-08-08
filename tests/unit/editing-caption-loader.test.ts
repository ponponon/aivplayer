import { afterEach, describe, expect, it } from 'vitest'
import { areEditingCaptionWordsCompatible, createEditingCaptionPathCandidates, createEditingCaptionSources, createEditingCaptionSourceRevisionKey, hasEditingCaptionSourceRevisionChanges, loadEditingCaptionSnapshot } from '../../src/renderer/src/app/editing-caption-loader'

const primary = { id: 'source-primary', path: '/videos/primary.mp4', name: 'primary.mp4', fingerprint: 'primary:10', durationSeconds: 10 }
const secondary = { id: 'source-secondary', path: '/videos/secondary.mp4', name: 'secondary.mp4', fingerprint: 'secondary:10', durationSeconds: 10 }

describe('editing caption word sidecar compatibility', () => {
  it('keeps word timings when the sidecar text matches the formal caption', () => {
    expect(areEditingCaptionWordsCompatible('Hello world', [
      { startSeconds: 0, endSeconds: 0.5, text: 'Hello' },
      { startSeconds: 0.5, endSeconds: 1, text: ' world' }
    ])).toBe(true)
  })

  it('drops stale word timings when a formal caption was rewritten', () => {
    expect(areEditingCaptionWordsCompatible('外部更新字幕', [
      { startSeconds: 0, endSeconds: 0.5, text: '第一句脚本' }
    ])).toBe(false)
  })
})

describe('editing caption sidecar source selection', () => {
  const originalWindowDescriptor = Object.getOwnPropertyDescriptor(globalThis, 'window')

  afterEach(() => {
    if (originalWindowDescriptor) Object.defineProperty(globalThis, 'window', originalWindowDescriptor)
    else Reflect.deleteProperty(globalThis, 'window')
  })

  it('skips an empty candidate and reports the selected path with all candidates', async () => {
    const contents = new Map([
      ['/media/demo.SRT', ''],
      ['/media/demo.VTT', 'WEBVTT\n\n00:00:00.000 --> 00:00:01.000\n跨设备字幕\n']
    ])
    Object.defineProperty(globalThis, 'window', { configurable: true, writable: true, value: { aiv: {
      readFileContent: async (path: string) => {
        const text = contents.get(path)
        if (text === undefined) throw new Error('missing')
        return text
      },
      getFileRevision: async () => 123
    } } })

    const result = await loadEditingCaptionSnapshot([{ path: null, pathCandidates: ['/media/demo.SRT', '/media/demo.VTT'], sourceId: primary.id, kind: 'source' }])

    expect(result.captions.map((caption) => caption.text)).toEqual(['跨设备字幕'])
    expect(result.sourcePaths[primary.id]?.source).toEqual({ selectedPath: '/media/demo.VTT', candidates: ['/media/demo.SRT', '/media/demo.VTT'], validCandidatePaths: ['/media/demo.VTT'] })
  })

  it('selects the first valid candidate while reporting other valid candidates', async () => {
    const contents = new Map([
      ['/media/demo.srt', 'WEBVTT\n\n00:00:00.000 --> 00:00:01.000\n优先字幕\n'],
      ['/media/demo.vtt', 'WEBVTT\n\n00:00:00.000 --> 00:00:01.000\n后备字幕\n']
    ])
    Object.defineProperty(globalThis, 'window', { configurable: true, writable: true, value: { aiv: {
      readFileContent: async (path: string) => {
        const text = contents.get(path)
        if (text === undefined) throw new Error('missing')
        return text
      },
      getFileRevision: async () => 456
    } } })

    const result = await loadEditingCaptionSnapshot([{ path: null, pathCandidates: ['/media/demo.srt', '/media/demo.vtt'], sourceId: primary.id, kind: 'source' }])

    expect(result.captions.map((caption) => caption.text)).toEqual(['优先字幕'])
    expect(result.sourcePaths[primary.id]?.source.validCandidatePaths).toEqual(['/media/demo.srt', '/media/demo.vtt'])
  })

  it('collapses valid candidates with identical parsed subtitle content', async () => {
    const content = 'WEBVTT\n\n00:00:00.000 --> 00:00:01.000\n同一份字幕\n'
    const contents = new Map([
      ['/media/demo.vtt', content],
      ['/media/demo.VTT', content]
    ])
    Object.defineProperty(globalThis, 'window', { configurable: true, writable: true, value: { aiv: {
      readFileContent: async (path: string) => {
        const text = contents.get(path)
        if (text === undefined) throw new Error('missing')
        return text
      },
      getFileRevision: async () => 789
    } } })

    const result = await loadEditingCaptionSnapshot([{ path: null, pathCandidates: ['/media/demo.vtt', '/media/demo.VTT'], sourceId: primary.id, kind: 'source' }])

    expect(result.sourcePaths[primary.id]?.source.validCandidatePaths).toEqual(['/media/demo.vtt'])
  })

  it('uses the configured translation language before language-agnostic fallbacks', () => {
    const candidates = createEditingCaptionPathCandidates('/media/demo.mp4', null, 'translation', 'en-US')
    expect(candidates.indexOf('/media/demo.en-US.srt')).toBeLessThan(candidates.indexOf('/media/demo.en.srt'))
    expect(candidates.indexOf('/media/demo.en-US.srt')).toBeLessThan(candidates.indexOf('/media/demo.translated.srt'))
    expect(candidates).not.toContain('/media/demo.zh-CN.srt')
  })

  it('accepts a common regional alias when the configured language is generic', () => {
    const candidates = createEditingCaptionPathCandidates('/media/demo.mp4', null, 'translation', 'zh')
    expect(candidates.indexOf('/media/demo.zh.srt')).toBeLessThan(candidates.indexOf('/media/demo.zh-CN.srt'))
    expect(candidates).toContain('/media/demo.zh-CN.VTT')
  })

  it('loads sidecars only for sources still used by the timeline', () => {
    const sources = createEditingCaptionSources({ sources: [primary, secondary], videoClips: [{ id: 'clip-1', sourceId: secondary.id, sourceStartSeconds: 0, sourceEndSeconds: 1 }] }, {
      currentMediaPath: primary.path,
      subtitlePath: '/cache/primary.srt',
      subtitleSrtPath: '/cache/primary.srt',
      translatedSubtitlePath: null,
      translatedSubtitleSrtPath: null
    })

    expect(sources.map((source) => source.sourceId)).toEqual(['source-secondary', 'source-secondary'])
    expect(sources[0]?.path).toBeNull()
    expect(sources[0]?.pathCandidates).not.toContain('/cache/primary.srt')
  })

  it('does not assign the current file sidecar to a replacement source by array position', () => {
    const sources = createEditingCaptionSources({ sources: [primary, secondary], videoClips: [{ id: 'clip-1', sourceId: secondary.id, sourceStartSeconds: 0, sourceEndSeconds: 1 }] }, {
      currentMediaPath: primary.path,
      subtitlePath: '/cache/primary.srt',
      subtitleSrtPath: '/cache/primary.srt',
      translatedSubtitlePath: '/cache/primary.translated.srt',
      translatedSubtitleSrtPath: '/cache/primary.translated.srt'
    })

    expect(sources.every((source) => source.path === null)).toBe(true)
    expect(sources.every((source) => !source.pathCandidates?.includes('/cache/primary.srt'))).toBe(true)
  })

  it('ignores the revision of an inactive old current file', () => {
    const project = { sources: [primary, secondary], videoClips: [{ id: 'clip-1', sourceId: secondary.id, sourceStartSeconds: 0, sourceEndSeconds: 1 }] }
    expect(createEditingCaptionSourceRevisionKey(project, { [primary.id]: { source: 100, translation: 200 }, [secondary.id]: { source: null, translation: null } })).toBe('sources=source-secondary:/videos/secondary.mp4:source=none:translation=none')
    expect(createEditingCaptionSourceRevisionKey(project, { [primary.id]: { source: 101, translation: 201 }, [secondary.id]: { source: null, translation: null } })).toBe('sources=source-secondary:/videos/secondary.mp4:source=none:translation=none')
  })

  it('changes the revision key when an active source sidecar changes', () => {
    const project = { sources: [primary, secondary], videoClips: [{ id: 'clip-1', sourceId: secondary.id, sourceStartSeconds: 0, sourceEndSeconds: 1 }] }
    const before = createEditingCaptionSourceRevisionKey(project, { [secondary.id]: { source: 100, translation: 200 } })
    const after = createEditingCaptionSourceRevisionKey(project, { [secondary.id]: { source: 101, translation: 200 } })
    expect(before).not.toBe(after)
  })

  it('distinguishes an inactive source from a deleted active sidecar', () => {
    expect(hasEditingCaptionSourceRevisionChanges({ [primary.id]: { source: 100, translation: 200 } }, { [secondary.id]: { source: null, translation: null } })).toBe(false)
    expect(hasEditingCaptionSourceRevisionChanges({ [secondary.id]: { source: 100, translation: 200 } }, { [secondary.id]: { source: null, translation: null } })).toBe(true)
    expect(hasEditingCaptionSourceRevisionChanges({ [secondary.id]: { source: null, translation: null } }, { [secondary.id]: { source: 100, translation: 200 } })).toBe(true)
  })
})
