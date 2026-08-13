import { existsSync } from 'node:fs'
import { join, resolve, sep } from 'node:path'
import { VISION_MODEL_FILES, VISION_MODEL_ID, VISION_MODEL_VARIANT } from '../../shared/vision-types'
import { getVisionPackStatus, loadVisionPackModule, type VisionPackStatus } from './vision-pack'

type TransformersModule = typeof import('@huggingface/transformers')

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

function createVisionModelPaths(modelDirectory: string): VisionModelPaths {
  return {
    modelDirectory,
    combinedModelPath: join(modelDirectory, 'onnx', 'model_uint8.onnx'),
    textModelPath: join(modelDirectory, 'onnx', 'text_model_uint8.onnx'),
    visionModelPath: join(modelDirectory, 'onnx', 'vision_model_uint8.onnx')
  }
}

export function getVisionModelPaths(resourcePath: string): VisionModelPaths {
  return createVisionModelPaths(join(resolve(resourcePath), 'vision', VISION_MODEL_ID))
}

export function getVisionUserDataModelPaths(userDataPath: string): VisionModelPaths {
  return createVisionModelPaths(join(resolve(userDataPath), 'models', 'vision', VISION_MODEL_ID))
}

export function isVisionModelPathsAvailable(paths: VisionModelPaths): boolean {
  return VISION_MODEL_FILES.every((relativePath) => existsSync(join(paths.modelDirectory, relativePath)))
}

export function resolveVisionModelPaths(resourcePath: string, userDataPath?: string): VisionModelPaths {
  const candidates = userDataPath
    ? [getVisionUserDataModelPaths(userDataPath), getVisionModelPaths(resourcePath)]
    : [getVisionModelPaths(resourcePath)]
  return candidates.find(isVisionModelPathsAvailable) ?? candidates[0]!
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
  private tokenizerPromise: Promise<any> | null = null
  private processorPromise: Promise<any> | null = null
  private textModelPromise: Promise<any> | null = null
  private visionModelPromise: Promise<any> | null = null

  private readonly pathsValue: VisionModelPaths
  private readonly resourcePath: string
  private readonly userDataPath?: string
  private transformersModule: TransformersModule | null = null

  constructor(resourcePath: string, userDataPath?: string) {
    this.resourcePath = resourcePath
    this.userDataPath = userDataPath
    this.pathsValue = resolveVisionModelPaths(resourcePath, userDataPath)
  }

  get paths(): VisionModelPaths {
    return this.pathsValue
  }

  isAvailable(): boolean {
    return this.getPackStatus().available && isVisionModelPathsAvailable(this.paths)
  }

  getPackStatus(): VisionPackStatus {
    return getVisionPackStatus(this.resourcePath, this.userDataPath ?? resolve('.'))
  }

  getStatusMessage(): string {
    const paths = this.paths
    if (!this.getPackStatus().available) return this.getPackStatus().message
    if (!isVisionModelPathsAvailable(paths)) {
      return `视觉模型文件不完整，需要 ${VISION_MODEL_FILES.join('、')}：${paths.modelDirectory}`
    }
    return `SigLIP2 ${VISION_MODEL_ID} 已就绪`
  }

  async prepareImageModel(): Promise<void> {
    if (!this.isAvailable()) throw new Error(this.getStatusMessage())
    await Promise.all([this.getProcessor(), this.getVisionModel()])
  }

  async prepareTextModel(): Promise<void> {
    if (!this.isAvailable()) throw new Error(this.getStatusMessage())
    await Promise.all([this.getTokenizer(), this.getTextModel()])
  }

  private getTokenizer() {
    const { AutoTokenizer } = this.getTransformers()
    this.tokenizerPromise ??= AutoTokenizer.from_pretrained(VISION_MODEL_ID)
    return this.tokenizerPromise
  }

  private getProcessor() {
    const { AutoProcessor } = this.getTransformers()
    this.processorPromise ??= AutoProcessor.from_pretrained(VISION_MODEL_ID)
    return this.processorPromise
  }

  private getTextModel() {
    const { SiglipTextModel } = this.getTransformers()
    this.textModelPromise ??= SiglipTextModel.from_pretrained(VISION_MODEL_ID, { dtype: VISION_MODEL_VARIANT, device: 'cpu' })
    return this.textModelPromise
  }

  private getVisionModel() {
    const { SiglipVisionModel } = this.getTransformers()
    this.visionModelPromise ??= SiglipVisionModel.from_pretrained(VISION_MODEL_ID, { dtype: VISION_MODEL_VARIANT, device: 'cpu' })
    return this.visionModelPromise
  }

  private getTransformers(): TransformersModule {
    if (this.transformersModule) return this.transformersModule
    const module = loadVisionPackModule<TransformersModule>('@huggingface/transformers', this.resourcePath, this.userDataPath ?? resolve('.'))
    const modelRoot = resolve(this.pathsValue.modelDirectory, '..') + sep
    module.env.localModelPath = modelRoot
    module.env.allowLocalModels = true
    module.env.allowRemoteModels = false
    module.env.logLevel = 50
    this.transformersModule = module
    return module
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
    const { RawImage } = this.getTransformers()
    const image = await RawImage.read(imagePath)
    const processor = await this.getProcessor()
    const inputs = await processor(image)
    const output = await (await this.getVisionModel())(inputs)
    return normalizeEmbedding(getPoolerOutput(output))
  }
}
