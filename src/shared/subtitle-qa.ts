import type { EditingCaption } from './editing-types'

export type SubtitleQaIssueKind = 'empty' | 'overlap' | 'too-short' | 'too-long' | 'high-cps' | 'wide-line' | 'punctuation' | 'recognition'
export type SubtitleQaIssueSeverity = 'error' | 'warning'

export type SubtitleQaIssue = {
  id: string
  kind: SubtitleQaIssueKind
  severity: SubtitleQaIssueSeverity
  captionId: string
  relatedCaptionId?: string
  startSeconds: number
  endSeconds: number
  value?: number
}

export type SubtitleQaOptions = {
  minDurationSeconds?: number
  maxDurationSeconds?: number
  maxCharactersPerSecond?: number
  maxLineWidthEm?: number
}

export const SUBTITLE_QA_REPAIRABLE_KINDS = ['overlap', 'too-short', 'too-long'] as const
export type SubtitleQaRepairableKind = typeof SUBTITLE_QA_REPAIRABLE_KINDS[number]

export function isSubtitleQaRepairableIssue(issue: SubtitleQaIssue): issue is SubtitleQaIssue & { kind: SubtitleQaRepairableKind } {
  return (SUBTITLE_QA_REPAIRABLE_KINDS as readonly string[]).includes(issue.kind)
}

const DEFAULT_OPTIONS: Required<SubtitleQaOptions> = {
  minDurationSeconds: 0.4,
  maxDurationSeconds: 7,
  maxCharactersPerSecond: 17,
  maxLineWidthEm: 32
}

function safeNumber(value: number, fallback: number): number {
  return Number.isFinite(value) ? value : fallback
}

function visibleCharacterCount(text: string): number {
  return [...text.replace(/\s+/gu, '')].length
}

function estimateLineWidthEm(text: string): number {
  return [...text].reduce((width, character) => {
    if (/\s/u.test(character)) return width + 0.28
    if (/[\u1100-\u11ff\u2e80-\u303f\u3040-\u30ff\u3130-\u318f\u31a0-\u31ff\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff\uff01-\uff60]/u.test(character)) return width + 1
    if (/[A-Z0-9]/u.test(character)) return width + 0.62
    if (/[a-z]/u.test(character)) return width + 0.52
    return width + 0.34
  }, 0)
}

function issue(caption: EditingCaption, kind: SubtitleQaIssueKind, severity: SubtitleQaIssueSeverity, value?: number, relatedCaptionId?: string): SubtitleQaIssue {
  const startSeconds = Math.max(0, safeNumber(caption.startSeconds, 0))
  const endSeconds = Math.max(startSeconds, startSeconds + Math.max(0, safeNumber(caption.durationSeconds, 0)))
  return { id: `subtitle-qa-${kind}-${caption.id}${relatedCaptionId ? `-${relatedCaptionId}` : ''}`, kind, severity, captionId: caption.id, ...(relatedCaptionId ? { relatedCaptionId } : {}), startSeconds, endSeconds, ...(value === undefined ? {} : { value }) }
}

function hasPunctuationIssue(text: string): boolean {
  return /\s+[,.!?，。！？；：]/u.test(text) || /([!?！？。])\1{2,}/u.test(text)
}

function hasRecognitionIssue(text: string): boolean {
  return text.includes('�') || /(?:\b(?:um+|uh+|er+)\b|(?:听不清|无法识别|[?？]{3,}))/iu.test(text) || /\b(\w+)(?:\s+\1){1,}\b/iu.test(text)
}

/** Returns deterministic, non-destructive subtitle QA findings for the editor. */
export function analyzeSubtitleQa(captions: readonly EditingCaption[], options: SubtitleQaOptions = {}): SubtitleQaIssue[] {
  const config = { ...DEFAULT_OPTIONS, ...options }
  const issues: SubtitleQaIssue[] = []
  const grouped = new Map<EditingCaption['kind'], EditingCaption[]>()

  for (const caption of captions) {
    const text = caption.text.trim()
    const durationSeconds = safeNumber(caption.durationSeconds, 0)
    const group = grouped.get(caption.kind) ?? []
    group.push(caption)
    grouped.set(caption.kind, group)

    if (!text) {
      issues.push(issue(caption, 'empty', 'error'))
      continue
    }
    if (durationSeconds < config.minDurationSeconds) issues.push(issue(caption, 'too-short', 'warning', durationSeconds))
    if (durationSeconds > config.maxDurationSeconds) issues.push(issue(caption, 'too-long', 'warning', durationSeconds))
    if (durationSeconds > 0) {
      const charactersPerSecond = visibleCharacterCount(text) / durationSeconds
      if (charactersPerSecond > config.maxCharactersPerSecond) issues.push(issue(caption, 'high-cps', 'warning', charactersPerSecond))
    }
    const maxLineWidth = Math.max(...text.split(/\r?\n/u).map(estimateLineWidthEm), 0)
    if (maxLineWidth > config.maxLineWidthEm) issues.push(issue(caption, 'wide-line', 'warning', maxLineWidth))
    if (hasPunctuationIssue(text)) issues.push(issue(caption, 'punctuation', 'warning'))
    if (hasRecognitionIssue(text)) issues.push(issue(caption, 'recognition', 'warning'))
  }

  for (const group of grouped.values()) {
    const sorted = [...group].sort((left, right) => left.startSeconds - right.startSeconds || left.id.localeCompare(right.id))
    for (let index = 1; index < sorted.length; index += 1) {
      const previous = sorted[index - 1]
      const current = sorted[index]
      if (!previous || !current) continue
      const previousEnd = previous.startSeconds + Math.max(0, previous.durationSeconds)
      const overlapSeconds = previousEnd - current.startSeconds
      if (overlapSeconds > 0.01) issues.push(issue(current, 'overlap', 'error', overlapSeconds, previous.id))
    }
  }

  return issues.sort((left, right) => left.startSeconds - right.startSeconds || left.severity.localeCompare(right.severity) || left.id.localeCompare(right.id))
}

type SubtitleQaRepairOptions = Pick<SubtitleQaOptions, 'minDurationSeconds' | 'maxDurationSeconds'>

function safeDuration(value: number): number {
  return Number.isFinite(value) && value >= 0 ? value : 0
}

function withoutSourceAnchor(caption: EditingCaption): Omit<EditingCaption, 'sourceId' | 'sourceStartSeconds' | 'sourceEndSeconds'> {
  const { sourceId: _sourceId, sourceStartSeconds: _sourceStartSeconds, sourceEndSeconds: _sourceEndSeconds, ...unanchored } = caption
  return unanchored
}

function trimCaptionEnd(caption: EditingCaption, endSeconds: number): EditingCaption {
  const durationSeconds = Math.max(0, endSeconds - Math.max(0, caption.startSeconds))
  const unanchored = withoutSourceAnchor(caption)
  const words = caption.words?.flatMap((word) => {
    const startSeconds = Math.max(0, word.startSeconds)
    const end = Math.min(durationSeconds, word.endSeconds)
    return end > startSeconds ? [{ ...word, startSeconds, endSeconds: end }] : []
  })
  return { ...unanchored, durationSeconds, ...(caption.words ? { words: words && words.length > 0 ? words : undefined } : {}) }
}

function nextCaptionStart(captions: readonly EditingCaption[], caption: EditingCaption): number {
  return captions
    .filter((candidate) => candidate.id !== caption.id && candidate.kind === caption.kind && candidate.startSeconds > caption.startSeconds + 0.001)
    .map((candidate) => candidate.startSeconds)
    .sort((left, right) => left - right)[0] ?? Number.POSITIVE_INFINITY
}

/** Applies only deterministic timing repairs; text, track identity and source media are never rewritten. */
export function repairSubtitleQaIssues(
  captions: readonly EditingCaption[],
  issues: readonly SubtitleQaIssue[],
  timelineDurationSeconds: number,
  options: SubtitleQaRepairOptions = {}
): EditingCaption[] {
  const selected = issues.filter(isSubtitleQaRepairableIssue)
  if (selected.length === 0) return [...captions]
  const minDurationSeconds = Math.max(0.1, safeNumber(options.minDurationSeconds ?? DEFAULT_OPTIONS.minDurationSeconds, DEFAULT_OPTIONS.minDurationSeconds))
  const maxDurationSeconds = Math.max(minDurationSeconds, safeNumber(options.maxDurationSeconds ?? DEFAULT_OPTIONS.maxDurationSeconds, DEFAULT_OPTIONS.maxDurationSeconds))
  const timelineEndSeconds = Math.max(0, safeNumber(timelineDurationSeconds, 0))
  let next = captions.map((caption) => ({ ...caption, ...(caption.words ? { words: caption.words.map((word) => ({ ...word })) } : {}) }))
  const selectedByKind = (kind: SubtitleQaRepairableKind): SubtitleQaIssue[] => selected.filter((issue) => issue.kind === kind).sort((left, right) => left.startSeconds - right.startSeconds || left.id.localeCompare(right.id))

  for (const issue of selectedByKind('too-long')) {
    const index = next.findIndex((caption) => caption.id === issue.captionId)
    const caption = index >= 0 ? next[index] : undefined
    if (!caption || safeDuration(caption.durationSeconds) <= maxDurationSeconds) continue
    next[index] = trimCaptionEnd(caption, caption.startSeconds + maxDurationSeconds)
  }

  for (const issue of selectedByKind('overlap')) {
    const currentIndex = next.findIndex((caption) => caption.id === issue.captionId)
    const relatedIndex = issue.relatedCaptionId ? next.findIndex((caption) => caption.id === issue.relatedCaptionId) : -1
    const current = currentIndex >= 0 ? next[currentIndex] : undefined
    const related = relatedIndex >= 0 ? next[relatedIndex] : undefined
    if (!current || !related || related.kind !== current.kind) continue
    const overlapEnd = Math.max(0, current.startSeconds)
    if (related.startSeconds + safeDuration(related.durationSeconds) - overlapEnd <= 0.01) continue
    next[relatedIndex] = trimCaptionEnd(related, overlapEnd)
  }

  for (const issue of selectedByKind('too-short')) {
    const index = next.findIndex((caption) => caption.id === issue.captionId)
    const caption = index >= 0 ? next[index] : undefined
    if (!caption || safeDuration(caption.durationSeconds) >= minDurationSeconds) continue
    const availableEnd = Math.min(timelineEndSeconds, nextCaptionStart(next, caption))
    const targetEnd = Math.min(caption.startSeconds + minDurationSeconds, availableEnd)
    if (targetEnd - caption.startSeconds <= safeDuration(caption.durationSeconds) + 0.001) continue
    next[index] = trimCaptionEnd(caption, targetEnd)
  }

  return next
}
