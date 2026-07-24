import { existsSync } from 'node:fs'
import { join, resolve, sep } from 'node:path'
import {
  AutoProcessor,
  AutoTokenizer,
  env,
  RawImage,
  SiglipTextModel,
  SiglipVisionModel
} from '@huggingface/transformers'
import { VISION_MODEL_ID, VISION_MODEL_VARIANT } from '../../shared/vision-types'

type TensorLike = {
  data?: ArrayLike<number>
}

type ModelOutput = {
  pooler_output?: TensorLike
}

export type VisionModelPaths = {
  modelDirectory: string
  combinedModelPath: string
  textModelPath: string
  visionModelPath: string
}

export function getVisionModelPaths(resourcePath: string): VisionModelPaths {
  const modelDirectory = join(resolve(resourcePath), 'vision', VISION_MODEL_ID)
  return {
    modelDirectory,
    combinedModelPath: join(modelDirectory, 'onnx', 'model_uint8.onnx'),
    textModelPath: join(modelDirectory, 'onnx', 'text_model_uint8.onnx'),
    visionModelPath: join(modelDirectory, 'onnx', 'vision_model_uint8.onnx')
  }
}

function normalizeEmbedding(tensor: TensorLike | undefined): number[] {
  if (!tensor?.data) throw new Error('SigLIP2 没有返回有效的 pooler_output')
  const values = Array.from(tensor.data, (value) => Number(value))
  const norm = Math.sqrt(values.reduce((sum, value) => sum + value * value, 0))
  if (!Number.isFinite(norm) || norm <= 0) throw new Error('SigLIP2 返回了无效的向量范数')
  return values.map((value) => value / norm)
}

function getPoolerOutput(output: unknown): TensorLike {
  const candidate = output as ModelOutput
  if (!candidate?.pooler_output) throw new Error('SigLIP2 输出中缺少 pooler_output')
  return candidate.pooler_output
}

export class VisionEmbeddingRuntime {
  private tokenizerPromise: ReturnType<typeof AutoTokenizer.from_pretrained> | null = null
  private processorPromise: ReturnType<typeof AutoProcessor.from_pretrained> | null = null
  private textModelPromise: ReturnType<typeof SiglipTextModel.from_pretrained> | null = null
  private visionModelPromise: ReturnType<typeof SiglipVisionModel.from_pretrained> | null = null

  private readonly resourcePath: string

  constructor(resourcePath: string) {
    this.resourcePath = resourcePath
    const modelRoot = resolve(resourcePath, 'vision') + sep
    env.localModelPath = modelRoot
    env.allowLocalModels = true
    env.allowRemoteModels = false
    env.logLevel = 50
  }

  get paths(): VisionModelPaths {
    return getVisionModelPaths(this.resourcePath)
  }

  isAvailable(): boolean {
    const paths = this.paths
    return existsSync(paths.textModelPath) && existsSync(paths.visionModelPath)
  }

  getStatusMessage(): string {
    const paths = this.paths
    if (!existsSync(paths.textModelPath) || !existsSync(paths.visionModelPath)) {
      return `视觉模型文件不完整，需要 text_model_uint8.onnx 和 vision_model_uint8.onnx：${paths.modelDirectory}`
    }
    return `SigLIP2 ${VISION_MODEL_ID} 已就绪`
  }

  async prepareImageModel(): Promise<void> {
    if (!this.isAvailable()) throw new Error(this.getStatusMessage())
    await Promise.all([this.getProcessor(), this.getVisionModel()])
  }

  private getTokenizer() {
    this.tokenizerPromise ??= AutoTokenizer.from_pretrained(VISION_MODEL_ID)
    return this.tokenizerPromise
  }

  private getProcessor() {
    this.processorPromise ??= AutoProcessor.from_pretrained(VISION_MODEL_ID)
    return this.processorPromise
  }

  private getTextModel() {
    this.textModelPromise ??= SiglipTextModel.from_pretrained(VISION_MODEL_ID, { dtype: VISION_MODEL_VARIANT, device: 'cpu' })
    return this.textModelPromise
  }

  private getVisionModel() {
    this.visionModelPromise ??= SiglipVisionModel.from_pretrained(VISION_MODEL_ID, { dtype: VISION_MODEL_VARIANT, device: 'cpu' })
    return this.visionModelPromise
  }

  async getTextEmbedding(query: string): Promise<number[]> {
    if (!this.isAvailable()) throw new Error(this.getStatusMessage())
    const tokenizer = await this.getTokenizer()
    const inputs = tokenizer([query.trim()], { padding: 'max_length', truncation: true, max_length: 64 })
    const output = await (await this.getTextModel())(inputs)
    return normalizeEmbedding(getPoolerOutput(output))
  }

  async getImageEmbedding(imagePath: string): Promise<number[]> {
    if (!this.isAvailable()) throw new Error(this.getStatusMessage())
    const image = await RawImage.read(imagePath)
    const processor = await this.getProcessor()
    const inputs = await processor(image)
    const output = await (await this.getVisionModel())(inputs)
    return normalizeEmbedding(getPoolerOutput(output))
  }
}
