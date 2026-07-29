import { describe, expect, it } from 'vitest'
import { filterSceneCutsForSourceRange, parseSceneCutTimestamps } from '../../src/core/media/scene-detection'
import { splitVideoClipAtSourceCuts } from '../../src/core/editing/timeline-operations'

describe('Pireel-style scene detection helpers', () => {
  it('parses FFmpeg showinfo timestamps and coalesces nearby cuts', () => {
    const output = '[Parsed_showinfo] pts_time:12.500\n[Parsed_showinfo] pts_time:12.900\n[Parsed_showinfo] pts_time:21.250'
    expect(parseSceneCutTimestamps(output, 0.8)).toEqual([12.5, 21.25])
  })

  it('keeps only cuts that leave usable source segments', () => {
    expect(filterSceneCutsForSourceRange([0.2, 1.2, 1.5, 5.5, 9.8], 1, 10, 0.4)).toEqual([1.5, 5.5])
  })

  it('splits one source clip without changing timeline duration or leaking transitions', () => {
    const clips = [{ id: 'clip-1', sourceId: 'source-1', sourceStartSeconds: 0, sourceEndSeconds: 12 }, { id: 'clip-2', sourceId: 'source-1', sourceStartSeconds: 12, sourceEndSeconds: 20, transitionIn: { type: 'dissolve' as const, durationSeconds: 0.3 } }]
    const result = splitVideoClipAtSourceCuts(clips, 'clip-2', [16, 18])
    expect(result.splitCount).toBe(2)
    expect(result.clips.map((clip) => [clip.id, clip.sourceStartSeconds, clip.sourceEndSeconds])).toEqual([
      ['clip-1', 0, 12],
      ['clip-2', 12, 16],
      ['clip-2-scene-1', 16, 18],
      ['clip-2-scene-2', 18, 20]
    ])
    expect(result.clips[1]?.transitionIn).toEqual({ type: 'dissolve', durationSeconds: 0.3 })
    expect(result.clips[2]?.transitionIn).toBeUndefined()
    expect(result.clips[3]?.transitionIn).toBeUndefined()
  })
})
