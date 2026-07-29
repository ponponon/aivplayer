export const DEFAULT_SILENCE_NOISE_DB = -35
export const DEFAULT_MIN_SILENCE_DURATION_SECONDS = 0.45
export const DEFAULT_SILENCE_PADDING_SECONDS = 0.08

type SilenceParserOptions = {
  durationSeconds?: number
  minSilenceDurationSeconds?: number
  paddingSeconds?: number
}

function finiteOr(value: number | undefined, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback
}

/** Parses FFmpeg silencedetect output and trims a small amount around speech edges. */
export function parseSilenceIntervals(output: string, options: SilenceParserOptions = {}): Array<{ startSeconds: number; endSeconds: number }> {
  const minDuration = Math.max(0.1, finiteOr(options.minSilenceDurationSeconds, DEFAULT_MIN_SILENCE_DURATION_SECONDS))
  const padding = Math.max(0, finiteOr(options.paddingSeconds, DEFAULT_SILENCE_PADDING_SECONDS))
  const duration = finiteOr(options.durationSeconds, Number.NaN)
  const intervals: Array<{ startSeconds: number; endSeconds: number }> = []
  let silenceStart: number | null = null

  for (const line of output.split(/\r?\n/)) {
    const startMatch = line.match(/silence_start:\s*(-?\d+(?:\.\d+)?)/)
    if (startMatch) {
      const start = Number(startMatch[1])
      silenceStart = Number.isFinite(start) ? Math.max(0, start) : silenceStart
    }
    const endMatch = line.match(/silence_end:\s*(-?\d+(?:\.\d+)?)/)
    if (!endMatch || silenceStart === null) continue
    const end = Number(endMatch[1])
    if (Number.isFinite(end) && end - silenceStart >= minDuration) intervals.push({ startSeconds: silenceStart, endSeconds: end })
    silenceStart = null
  }

  if (silenceStart !== null && Number.isFinite(duration) && duration - silenceStart >= minDuration) intervals.push({ startSeconds: silenceStart, endSeconds: duration })

  return intervals
    .map(({ startSeconds, endSeconds }) => ({ startSeconds: startSeconds + padding, endSeconds: endSeconds - padding }))
    .filter(({ startSeconds, endSeconds }) => endSeconds - startSeconds >= 0.1)
}

/** Merges overlapping silence intervals before mapping them onto the edited timeline. */
export function mergeSilenceIntervals(intervals: readonly { startSeconds: number; endSeconds: number }[]): Array<{ startSeconds: number; endSeconds: number }> {
  const sorted = intervals
    .map(({ startSeconds, endSeconds }) => ({ startSeconds: Math.min(startSeconds, endSeconds), endSeconds: Math.max(startSeconds, endSeconds) }))
    .filter(({ startSeconds, endSeconds }) => Number.isFinite(startSeconds) && Number.isFinite(endSeconds) && endSeconds - startSeconds >= 0.1)
    .sort((left, right) => left.startSeconds - right.startSeconds)
  const merged: Array<{ startSeconds: number; endSeconds: number }> = []
  for (const interval of sorted) {
    const previous = merged.at(-1)
    if (previous && interval.startSeconds <= previous.endSeconds + 0.2) previous.endSeconds = Math.max(previous.endSeconds, interval.endSeconds)
    else merged.push({ ...interval })
  }
  return merged
}
