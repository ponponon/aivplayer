import { createHash } from 'node:crypto'
import type { MediaEvidenceDraftCue } from '../../shared/evidence-task-types'

export const MAX_MEDIA_EVIDENCE_DRAFT_CUES = 200
export const MAX_MEDIA_EVIDENCE_DRAFT_TEXT_LENGTH = 100_000

type DraftCueInput = {
  startSeconds?: unknown
  endSeconds?: unknown
  text?: unknown
}

export function normalizeMediaEvidenceDraftCues(value: unknown): MediaEvidenceDraftCue[] {
  if (!Array.isArray(value) || value.length === 0) throw new Error('字幕草稿至少需要一条 cue')
  if (value.length > MAX_MEDIA_EVIDENCE_DRAFT_CUES) throw new Error(`字幕草稿最多支持 ${MAX_MEDIA_EVIDENCE_DRAFT_CUES} 条 cue`)

  const cues = value.map((rawValue, index) => {
    const raw = rawValue as DraftCueInput
    const startSeconds = typeof raw?.startSeconds === 'number' ? Math.round(raw.startSeconds * 1000) / 1000 : Number.NaN
    const endSeconds = typeof raw?.endSeconds === 'number' ? Math.round(raw.endSeconds * 1000) / 1000 : Number.NaN
    const text = typeof raw?.text === 'string' ? raw.text.replace(/\r\n?/g, '\n').trim() : ''
    if (!Number.isFinite(startSeconds) || startSeconds < 0 || !Number.isFinite(endSeconds) || endSeconds <= startSeconds) {
      throw new Error(`字幕草稿第 ${index + 1} 条 cue 时间范围无效`)
    }
    if (!text || text.length > 20_000) throw new Error(`字幕草稿第 ${index + 1} 条 cue 文本无效`)
    return { startSeconds, endSeconds, text }
  }).sort((left, right) => left.startSeconds - right.startSeconds || left.endSeconds - right.endSeconds || left.text.localeCompare(right.text))

  let totalTextLength = 0
  for (let index = 0; index < cues.length; index += 1) {
    const cue = cues[index]
    const previousCue = cues[index - 1]
    if (previousCue && cue.startSeconds < previousCue.endSeconds) throw new Error('字幕草稿 cue 不能重叠')
    totalTextLength += cue.text.length
  }
  if (totalTextLength > MAX_MEDIA_EVIDENCE_DRAFT_TEXT_LENGTH) throw new Error('字幕草稿总文本过长')
  return cues
}

export function summarizeMediaEvidenceDraftCues(cues: readonly MediaEvidenceDraftCue[]): Pick<MediaEvidenceDraftCue, 'startSeconds' | 'endSeconds' | 'text'> {
  if (cues.length === 0) throw new Error('字幕草稿至少需要一条 cue')
  return {
    startSeconds: cues[0]?.startSeconds ?? 0,
    endSeconds: cues[cues.length - 1]?.endSeconds ?? 0,
    text: cues.map((cue) => cue.text).join('\n')
  }
}

export function createMediaEvidenceDraftId(sourceFingerprint: string, cues: readonly MediaEvidenceDraftCue[]): string {
  return `tts-draft-${createHash('sha256').update(`${sourceFingerprint}|${JSON.stringify(cues)}`).digest('hex').slice(0, 24)}`
}
