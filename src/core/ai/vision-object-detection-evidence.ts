import { createVisionEvidenceId } from './vision-evidence'
import type { VisionEvidence } from '../../shared/vision-types'
import type { VisionObjectDetection, VisionObjectDetectionBox } from '../../shared/vision-object-detection-types'

export const VISION_OBJECT_DETECTION_EVIDENCE_MODEL_ID = 'transformers-object-detection'
export const VISION_OBJECT_DETECTION_EVIDENCE_MODEL_VARIANT = 'local-model-v1'

export type VisionObjectDetectionEvidenceInput = {
  sourceId: string
  videoPath: string
  fileName: string
  sourceFingerprint: string
  frameId: string
  thumbnailPath: string
  timestampSeconds: number
  intervalSeconds: number
  detections: readonly VisionObjectDetection[]
  modelId?: string
  modelVersion?: string
  threshold?: number
  generatedAt?: number
}

function round(value: number): number {
  return Number(value.toFixed(3))
}

function normalizeBox(box: VisionObjectDetectionBox): VisionObjectDetectionBox | null {
  if (![box.xmin, box.ymin, box.xmax, box.ymax].every(Number.isFinite)) return null
  const normalized = {
    xmin: round(box.xmin),
    ymin: round(box.ymin),
    xmax: round(box.xmax),
    ymax: round(box.ymax)
  }
  if (normalized.xmin < 0 || normalized.ymin < 0 || normalized.xmax <= normalized.xmin || normalized.ymax <= normalized.ymin) return null
  return normalized
}

function normalizeDetection(detection: VisionObjectDetection, threshold: number): VisionObjectDetection | null {
  const label = typeof detection.label === 'string' ? detection.label.trim() : ''
  const score = Number(detection.score)
  const box = normalizeBox(detection.box)
  if (!label || !Number.isFinite(score) || score < threshold || score > 1 || !box) return null
  return { label, score: round(score), box }
}

/** Converts one local detector result into deterministic, searchable object evidence. */
export function createVisionObjectDetectionEvidence(input: VisionObjectDetectionEvidenceInput): VisionEvidence[] {
  if (!Number.isFinite(input.timestampSeconds) || !Number.isFinite(input.intervalSeconds) || input.intervalSeconds <= 0) return []
  const threshold = Number.isFinite(input.threshold) ? Math.max(0, Math.min(1, input.threshold!)) : 0
  const startSeconds = round(Math.max(0, input.timestampSeconds - input.intervalSeconds / 2))
  const endSeconds = round(Math.max(startSeconds + 0.001, input.timestampSeconds + input.intervalSeconds / 2))
  const generatedAt = Number.isFinite(input.generatedAt) ? input.generatedAt : Date.now()
  const modelId = input.modelId?.trim() || VISION_OBJECT_DETECTION_EVIDENCE_MODEL_ID
  const modelVariant = input.modelVersion?.trim() || VISION_OBJECT_DETECTION_EVIDENCE_MODEL_VARIANT
  const uniqueDetections = new Map<string, VisionObjectDetection>()

  for (const rawDetection of input.detections) {
    const detection = normalizeDetection(rawDetection, threshold)
    if (!detection) continue
    const key = [detection.label, detection.score, detection.box.xmin, detection.box.ymin, detection.box.xmax, detection.box.ymax].join(':')
    uniqueDetections.set(key, detection)
  }

  return [...uniqueDetections.values()].map((detection) => {
    const identity = [detection.label, detection.score, detection.box.xmin, detection.box.ymin, detection.box.xmax, detection.box.ymax].join(':')
    return {
      id: createVisionEvidenceId({
        videoPath: input.videoPath,
        evidenceType: 'object',
        startSeconds,
        endSeconds,
        text: detection.label,
        sourceFingerprint: input.sourceFingerprint,
        identity
      }),
      sourceId: input.sourceId,
      videoPath: input.videoPath,
      fileName: input.fileName,
      evidenceType: 'object',
      startSeconds,
      endSeconds,
      text: detection.label,
      frameId: input.frameId.trim() || undefined,
      thumbnailPath: input.thumbnailPath.trim() || undefined,
      confidence: detection.score,
      box: detection.box,
      sourceFingerprint: input.sourceFingerprint,
      modelId,
      modelVariant,
      generatedAt
    }
  })
}
