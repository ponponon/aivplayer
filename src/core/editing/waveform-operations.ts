import type { EditingVideoClipSpan } from './timeline-math'

export type EditingWaveformSource = { url: string; durationSeconds: number }

export type EditingWaveformSegment = {
  sourceId: string
  editedStartSeconds: number
  editedEndSeconds: number
  sourceStartSeconds: number
  sourceEndSeconds: number
  sourceDurationSeconds: number
  url: string
}

/** Windows a source waveform into each surviving edited clip without re-rendering audio. */
export function getEditingWaveformSegments(spans: readonly EditingVideoClipSpan[], waveforms: Readonly<Record<string, EditingWaveformSource>>): EditingWaveformSegment[] {
  return spans.flatMap((span) => {
    const waveform = waveforms[span.clip.sourceId]
    if (!waveform?.url || span.editedEndSeconds <= span.editedStartSeconds) return []
    return [{
      sourceId: span.clip.sourceId,
      editedStartSeconds: span.editedStartSeconds,
      editedEndSeconds: span.editedEndSeconds,
      sourceStartSeconds: span.clip.sourceStartSeconds,
      sourceEndSeconds: span.clip.sourceEndSeconds,
      sourceDurationSeconds: waveform.durationSeconds,
      url: waveform.url
    }]
  })
}
