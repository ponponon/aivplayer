import { createVisionEvidenceId } from './vision-evidence'
import { type VisionEvidence } from '../../shared/vision-types'

export const VISION_SCENE_EVIDENCE_MODEL_ID = 'ffmpeg-scene-detection'
export const VISION_SCENE_EVIDENCE_MODEL_VARIANT = 'scene-cut-v1'

export type VisionSceneFrame = {
  id: string
  timestampSeconds: number
  thumbnailPath: string
}

export type VisionSceneEvidenceInput = {
  sourceId: string
  videoPath: string
  fileName: string
  sourceFingerprint: string
  durationSeconds: number
  cutTimestamps: readonly number[]
  frames?: readonly VisionSceneFrame[]
  generatedAt?: number
}

function roundSeconds(value: number): number {
  return Number(value.toFixed(3))
}

function normalizeCuts(cutTimestamps: readonly number[], durationSeconds: number): number[] {
  const cuts: number[] = []
  for (const rawTimestamp of [...cutTimestamps].sort((left, right) => left - right)) {
    if (!Number.isFinite(rawTimestamp)) continue
    const timestamp = roundSeconds(rawTimestamp)
    if (timestamp <= 0 || timestamp >= durationSeconds) continue
    const previous = cuts.at(-1)
    if (previous === undefined || timestamp - previous >= 0.1) cuts.push(timestamp)
  }
  return cuts
}

function nearestFrame(frames: readonly VisionSceneFrame[], timestampSeconds: number): VisionSceneFrame | undefined {
  return frames
    .filter((frame) => Number.isFinite(frame.timestampSeconds) && frame.id.trim().length > 0)
    .reduce<VisionSceneFrame | undefined>((closest, frame) => {
      if (!closest) return frame
      return Math.abs(frame.timestampSeconds - timestampSeconds) < Math.abs(closest.timestampSeconds - timestampSeconds) ? frame : closest
    }, undefined)
}

/** Converts FFmpeg cut points into deterministic, searchable source-media ranges. */
export function createVisionSceneEvidence(input: VisionSceneEvidenceInput): VisionEvidence[] {
  if (!Number.isFinite(input.durationSeconds) || input.durationSeconds <= 0) return []
  const durationSeconds = roundSeconds(input.durationSeconds)
  if (durationSeconds <= 0) return []
  const cuts = normalizeCuts(input.cutTimestamps, durationSeconds)
  const boundaries = [0, ...cuts, durationSeconds]
  const frames = input.frames ?? []
  const generatedAt = Number.isFinite(input.generatedAt) ? input.generatedAt : Date.now()
  const evidence: VisionEvidence[] = []

  for (let index = 0; index < boundaries.length - 1; index += 1) {
    const startSeconds = boundaries[index]!
    const endSeconds = boundaries[index + 1]!
    if (endSeconds <= startSeconds) continue
    const frame = nearestFrame(frames, (startSeconds + endSeconds) / 2)
    const sceneNumber = index + 1
    const label = index === 0 ? '场景片段 / scene segment' : '场景切换 / scene change'
    const text = `${label} ${sceneNumber}`
    evidence.push({
      id: createVisionEvidenceId({
        videoPath: input.videoPath,
        evidenceType: 'scene',
        startSeconds,
        endSeconds,
        text,
        sourceFingerprint: input.sourceFingerprint
      }),
      sourceId: input.sourceId,
      videoPath: input.videoPath,
      fileName: input.fileName,
      evidenceType: 'scene',
      startSeconds,
      endSeconds,
      text,
      frameId: frame?.id,
      thumbnailPath: frame?.thumbnailPath,
      sourceFingerprint: input.sourceFingerprint,
      modelId: VISION_SCENE_EVIDENCE_MODEL_ID,
      modelVariant: VISION_SCENE_EVIDENCE_MODEL_VARIANT,
      generatedAt
    })
  }
  return evidence
}
