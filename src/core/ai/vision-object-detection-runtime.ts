import { isAbsolute } from 'node:path'
import { VISION_OBJECT_DETECTION_MODEL_ID, VISION_OBJECT_DETECTION_MODEL_VERSION, VISION_OBJECT_DETECTION_PROVIDER_ID, getVisionObjectDetectionModelPaths, getVisionObjectDetectionModelStatus, type VisionObjectDetectionModelPaths } from './vision-object-detection-model'
import type { VisionObjectDetection, VisionObjectDetectionBox, VisionObjectDetectionModelStatus, VisionObjectDetectionResult } from '../../shared/vision-object-detection-types'

export const DEFAULT_VISION_OBJECT_DETECTION_THRESHOLD = 0.5

type RawObjectDetection = {
  label?: unknown
  score?: unknown
  box?: {
    xmin?: unknown
    ymin?: unknown
    xmax?: unknown
    ymax?: unknown
  }
}

export type VisionObjectDetectionPipeline = (image: unknown, options?: { threshold?: number; percentage?: boolean }) => Promise<unknown>

export type VisionObjectDetectionPipelineBundle = {
  detector: VisionObjectDetectionPipeline
  readImage: (imagePath: string) => Promise<unknown>
}

export type VisionObjectDetectionRuntimeOptions = {
  userDataPath: string
  modelDirectory?: string | null
  platform?: NodeJS.Platform
  arch?: string
  loadPipeline?: (paths: VisionObjectDetectionModelPaths) => Promise<VisionObjectDetectionPipelineBundle>
  readImage?: (imagePath: string) => Promise<unknown>
}

function normalizeThreshold(value: number | undefined): number {
  return typeof value === 'number' && Number.isFinite(value)
    ? Math.min(1, Math.max(0, value))
    : DEFAULT_VISION_OBJECT_DETECTION_THRESHOLD
}

function normalizeBox(value: RawObjectDetection['box']): VisionObjectDetectionBox | null {
  if (!value) return null
  const coordinates = [value.xmin, value.ymin, value.xmax, value.ymax].map(Number)
  if (coordinates.some((coordinate) => !Number.isFinite(coordinate))) return null
  const [xmin, ymin, xmax, ymax] = coordinates
  return {
    xmin: Math.min(xmin!, xmax!),
    ymin: Math.min(ymin!, ymax!),
    xmax: Math.max(xmin!, xmax!),
    ymax: Math.max(ymin!, ymax!)
  }
}

export function normalizeVisionObjectDetections(value: unknown): VisionObjectDetection[] {
  if (!Array.isArray(value)) return []
  return value.flatMap((candidate: RawObjectDetection) => {
    const label = typeof candidate?.label === 'string' ? candidate.label.trim() : ''
    const score = typeof candidate?.score === 'number' && Number.isFinite(candidate.score)
      ? Math.min(1, Math.max(0, candidate.score))
      : null
    const box = normalizeBox(candidate?.box)
    if (!label || score === null || !box) return []
    return [{ label, score, box }]
  })
}

async function loadDefaultPipeline(paths: VisionObjectDetectionModelPaths): Promise<VisionObjectDetectionPipelineBundle> {
  const { pipeline, RawImage } = await import('@huggingface/transformers')
  const detector = await pipeline('object-detection', paths.modelDirectory, { local_files_only: true, device: 'cpu' })
  return {
    detector: detector as unknown as VisionObjectDetectionPipeline,
    readImage: (imagePath) => RawImage.read(imagePath)
  }
}

/** Local-only object detection runtime. It never downloads model files implicitly. */
export class VisionObjectDetectionRuntime {
  private readonly options: VisionObjectDetectionRuntimeOptions
  private pipelinePromise: Promise<VisionObjectDetectionPipelineBundle> | null = null

  constructor(options: VisionObjectDetectionRuntimeOptions) {
    this.options = options
  }

  getStatus(): VisionObjectDetectionModelStatus {
    return getVisionObjectDetectionModelStatus(
      this.options.userDataPath,
      this.options.platform,
      this.options.arch,
      this.options.modelDirectory
    )
  }

  async prepare(): Promise<void> {
    await this.getPipeline()
  }

  async detectImage(imagePath: string, threshold?: number): Promise<VisionObjectDetectionResult> {
    const normalizedPath = imagePath.trim()
    if (!normalizedPath || !isAbsolute(normalizedPath)) throw new Error('物体检测只接受绝对图片路径')
    const normalizedThreshold = normalizeThreshold(threshold)
    const pipeline = await this.getPipeline()
    const image = await (this.options.readImage ?? pipeline.readImage)(normalizedPath)
    const rawDetections = await pipeline.detector(image, { threshold: normalizedThreshold, percentage: false })
    return {
      providerId: VISION_OBJECT_DETECTION_PROVIDER_ID,
      modelId: VISION_OBJECT_DETECTION_MODEL_ID,
      modelVersion: VISION_OBJECT_DETECTION_MODEL_VERSION,
      imagePath: normalizedPath,
      threshold: normalizedThreshold,
      detections: normalizeVisionObjectDetections(rawDetections),
      generatedAt: Date.now()
    }
  }

  private getPipeline(): Promise<VisionObjectDetectionPipelineBundle> {
    if (this.pipelinePromise) return this.pipelinePromise
    const status = this.getStatus()
    if (!status.available) return Promise.reject(new Error(status.message))
    const loadPipeline = this.options.loadPipeline ?? loadDefaultPipeline
    const paths = getVisionObjectDetectionModelPaths(status.modelDirectory)
    this.pipelinePromise = loadPipeline(paths)
    this.pipelinePromise.catch(() => { this.pipelinePromise = null })
    return this.pipelinePromise
  }
}
