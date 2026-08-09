import { createVisionEvidenceId } from './vision-evidence'
import { type VisionEvidence } from '../../shared/vision-types'

export const VISION_ENTITY_EVIDENCE_MODEL_ID = 'siglip2-zero-shot-labels'
export const VISION_ENTITY_EVIDENCE_MODEL_VARIANT = 'label-v1'
export const DEFAULT_MIN_ENTITY_SIMILARITY = 0.18
export const DEFAULT_MAX_ENTITY_LABELS_PER_FRAME = 3

export type VisionEntityLabel = {
  id: string
  query: string
  displayName: string
}

/** Small, explainable local vocabulary; adding a label never changes old evidence rows. */
export const DEFAULT_VISION_ENTITY_LABELS: readonly VisionEntityLabel[] = [
  { id: 'person', query: 'a photo of a person', displayName: '人物 / person' },
  { id: 'vehicle', query: 'a photo of a vehicle', displayName: '车辆 / vehicle' },
  { id: 'animal', query: 'a photo of an animal', displayName: '动物 / animal' },
  { id: 'food', query: 'a photo of food', displayName: '食物 / food' },
  { id: 'indoor', query: 'an indoor scene', displayName: '室内 / indoor' },
  { id: 'outdoor', query: 'an outdoor scene', displayName: '室外 / outdoor' },
  { id: 'city', query: 'a city scene', displayName: '城市 / city' },
  { id: 'nature', query: 'a nature scene', displayName: '自然 / nature' },
  { id: 'night', query: 'a night scene', displayName: '夜景 / night' },
  { id: 'text', query: 'a scene with readable text', displayName: '文字 / text' }
]

export function getVisionEntityLabelIdForDisplayName(displayName: string): string | undefined {
  const normalized = displayName.trim().toLocaleLowerCase()
  return DEFAULT_VISION_ENTITY_LABELS.find((label) => label.displayName.toLocaleLowerCase() === normalized)?.id
}

export type VisionEntityScore = {
  label: VisionEntityLabel
  similarity: number
}

export type VisionEntityEvidenceInput = {
  sourceId: string
  videoPath: string
  fileName: string
  sourceFingerprint: string
  frameId: string
  thumbnailPath: string
  timestampSeconds: number
  intervalSeconds: number
  scores: readonly VisionEntityScore[]
  generatedAt?: number
  minimumSimilarity?: number
  maximumLabels?: number
}

function roundSeconds(value: number): number {
  return Number(value.toFixed(3))
}

export function selectVisionEntityLabels(
  scores: readonly VisionEntityScore[],
  minimumSimilarity = DEFAULT_MIN_ENTITY_SIMILARITY,
  maximumLabels = DEFAULT_MAX_ENTITY_LABELS_PER_FRAME
): VisionEntityScore[] {
  const threshold = Number.isFinite(minimumSimilarity) ? Math.max(-1, Math.min(1, minimumSimilarity)) : DEFAULT_MIN_ENTITY_SIMILARITY
  const limit = Number.isFinite(maximumLabels) ? Math.max(1, Math.floor(maximumLabels)) : DEFAULT_MAX_ENTITY_LABELS_PER_FRAME
  const bestById = new Map<string, VisionEntityScore>()
  for (const score of scores) {
    if (!score.label.id.trim() || !Number.isFinite(score.similarity) || score.similarity < threshold) continue
    const previous = bestById.get(score.label.id)
    if (!previous || score.similarity > previous.similarity) bestById.set(score.label.id, score)
  }
  return [...bestById.values()]
    .sort((left, right) => right.similarity - left.similarity || left.label.id.localeCompare(right.label.id))
    .slice(0, limit)
}

/** Converts local image/text similarity scores into searchable, source-anchored entity evidence. */
export function createVisionEntityEvidence(input: VisionEntityEvidenceInput): VisionEvidence[] {
  if (!Number.isFinite(input.timestampSeconds) || !Number.isFinite(input.intervalSeconds) || input.intervalSeconds <= 0) return []
  const selected = selectVisionEntityLabels(input.scores, input.minimumSimilarity, input.maximumLabels)
  const startSeconds = roundSeconds(Math.max(0, input.timestampSeconds - input.intervalSeconds / 2))
  const endSeconds = roundSeconds(Math.max(startSeconds + 0.001, input.timestampSeconds + input.intervalSeconds / 2))
  const generatedAt = Number.isFinite(input.generatedAt) ? input.generatedAt : Date.now()
  return selected.map(({ label }) => {
    const text = label.displayName
    return {
      id: createVisionEvidenceId({
        videoPath: input.videoPath,
        evidenceType: 'entity',
        startSeconds,
        endSeconds,
        text,
        sourceFingerprint: input.sourceFingerprint
      }),
      sourceId: input.sourceId,
      videoPath: input.videoPath,
      fileName: input.fileName,
      evidenceType: 'entity',
      startSeconds,
      endSeconds,
      text,
      frameId: input.frameId.trim() || undefined,
      thumbnailPath: input.thumbnailPath.trim() || undefined,
      sourceFingerprint: input.sourceFingerprint,
      modelId: VISION_ENTITY_EVIDENCE_MODEL_ID,
      modelVariant: VISION_ENTITY_EVIDENCE_MODEL_VARIANT,
      generatedAt
    }
  })
}
