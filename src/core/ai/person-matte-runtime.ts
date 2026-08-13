import type { RawImage } from '@huggingface/transformers'
import { getPersonMatteModelStatus, resolvePersonMatteModelPaths, type PersonMatteModelPaths, type PersonMatteModelStatus } from './person-matte-model'
import { loadVisionPackModule } from './vision-pack'

type BackgroundRemovalPipeline = (image: RawImage) => Promise<RawImage>

export type PersonMatteRuntimeOptions = {
  resourcePath: string
  userDataPath?: string
}

/** Local-only MODNet runtime. It never downloads model files implicitly. */
export class PersonMatteRuntime {
  private readonly resourcePath: string
  private readonly userDataPath?: string
  private pipelinePromise: Promise<BackgroundRemovalPipeline> | null = null

  constructor(options: PersonMatteRuntimeOptions) {
    this.resourcePath = options.resourcePath
    this.userDataPath = options.userDataPath
  }

  get modelPaths(): PersonMatteModelPaths {
    return resolvePersonMatteModelPaths(this.resourcePath, this.userDataPath)
  }

  getStatus(): PersonMatteModelStatus {
    return getPersonMatteModelStatus(this.resourcePath, this.userDataPath)
  }

  async prepare(): Promise<void> {
    await this.getPipeline()
  }

  async removeBackground(imagePath: string): Promise<RawImage> {
    const { RawImage } = this.getTransformers()
    return (await this.getPipeline())(await RawImage.read(imagePath))
  }

  async removeBackgroundToFile(imagePath: string, outputPath: string): Promise<string> {
    const image = await this.removeBackground(imagePath)
    await image.save(outputPath)
    return outputPath
  }

  private getPipeline(): Promise<BackgroundRemovalPipeline> {
    if (this.pipelinePromise) return this.pipelinePromise
    const status = this.getStatus()
    if (!status.available) return Promise.reject(new Error(status.message))

    this.pipelinePromise = (async () => {
      const { pipeline } = this.getTransformers()
      const segmenter = await pipeline('background-removal', this.modelPaths.modelDirectory, { local_files_only: true, device: 'cpu' })
      return segmenter as unknown as BackgroundRemovalPipeline
    })()
    this.pipelinePromise.catch(() => { this.pipelinePromise = null })
    return this.pipelinePromise
  }

  private getTransformers(): typeof import('@huggingface/transformers') {
    return loadVisionPackModule<typeof import('@huggingface/transformers')>('@huggingface/transformers', this.resourcePath, this.userDataPath ?? '.')
  }
}
