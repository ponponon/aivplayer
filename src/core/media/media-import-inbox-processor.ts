import { resolveMediaSubtitleSidecar, type MediaSubtitleSidecarResolution } from '../ai/subtitle-sidecar'
import { createMediaProbeMetadata } from './media-metadata'
import { MediaImportInboxStore } from './media-import-inbox'
import type {
  MediaImportInboxItem,
  MediaImportInboxPipelineProgress,
  MediaImportInboxPipelineStage
} from '../../shared/media-import-inbox'
import type { MediaProbeMetadata } from '../../shared/media-types'
import type { VisionIndexProgress } from '../../shared/vision-types'

export type MediaImportInboxProcessorDependencies = {
  store: MediaImportInboxStore
  getMediaMetadata: (mediaPath: string) => Promise<MediaProbeMetadata | null>
  resolveSubtitle: (mediaPath: string) => Promise<MediaSubtitleSidecarResolution>
  runVisionIndex: (
    mediaPath: string,
    signal: AbortSignal,
    onProgress: (progress: VisionIndexProgress) => void
  ) => Promise<VisionIndexProgress>
  onItemChanged?: (item: MediaImportInboxItem) => void
  onProgress?: (progress: MediaImportInboxPipelineProgress) => void
  now?: () => number
}

export class MediaImportInboxProcessor {
  private readonly dependencies: MediaImportInboxProcessorDependencies
  private readonly pendingItemIds = new Set<string>()
  private activeController: AbortController | null = null
  private drainPromise: Promise<void> | null = null
  private stopped = false

  constructor(dependencies: MediaImportInboxProcessorDependencies) {
    this.dependencies = dependencies
  }

  resume(): void {
    for (const item of this.dependencies.store.listItems()) {
      if (item.status === 'queued' || item.status === 'processing') this.enqueue(item.id)
    }
  }

  enqueue(itemId: string): boolean {
    if (this.stopped || this.pendingItemIds.has(itemId)) return false
    const item = this.dependencies.store.listItems().find((candidate) => candidate.id === itemId)
    if (!item || (item.status !== 'queued' && item.status !== 'processing')) return false
    this.pendingItemIds.add(itemId)
    if (!this.drainPromise) this.drainPromise = this.drain().finally(() => { this.drainPromise = null })
    return true
  }

  stop(): void {
    this.stopped = true
    this.pendingItemIds.clear()
    this.activeController?.abort()
  }

  get isRunning(): boolean {
    return this.pendingItemIds.size > 0 || this.activeController !== null
  }

  private get now(): number {
    return this.dependencies.now?.() ?? Date.now()
  }

  private emitItem(item: MediaImportInboxItem | null): void {
    if (item) this.dependencies.onItemChanged?.(item)
  }

  private emitProgress(itemId: string, stage: 'metadata' | 'subtitle' | 'vision', status: MediaImportInboxPipelineStage, progress?: VisionIndexProgress, message?: string): void {
    this.dependencies.onProgress?.({ itemId, stage, status, ...(progress ? { progress } : {}), ...(message ? { message } : {}) })
  }

  private async updateStage(itemId: string, stage: 'metadata' | 'subtitle' | 'vision', status: MediaImportInboxPipelineStage, message?: string): Promise<MediaImportInboxItem | null> {
    const item = this.dependencies.store.updatePipeline(itemId, { [stage]: status }, this.now)
    if (!item) return null
    await this.dependencies.store.persist()
    this.emitItem(item)
    this.emitProgress(itemId, stage, status, undefined, message)
    return item
  }

  private async drain(): Promise<void> {
    while (!this.stopped && this.pendingItemIds.size > 0) {
      const itemId = this.pendingItemIds.values().next().value as string | undefined
      if (!itemId) break
      this.pendingItemIds.delete(itemId)
      await this.processItem(itemId)
    }
  }

  private async processItem(itemId: string): Promise<void> {
    let current: MediaImportInboxItem | null = this.dependencies.store.listItems().find((item) => item.id === itemId) ?? null
    if (!current || (current.status !== 'queued' && current.status !== 'processing')) return
    let activeStage: 'metadata' | 'subtitle' | 'vision' = 'metadata'
    const controller = new AbortController()
    this.activeController = controller

    try {
      if (current.status === 'queued') {
        current = this.dependencies.store.transition(itemId, 'processing', undefined, this.now)
        await this.dependencies.store.persist()
        this.emitItem(current)
      }
      if (!current) return

      activeStage = 'metadata'
      await this.updateStage(itemId, activeStage, 'processing', '正在读取媒体元数据…')
      const metadata = await this.dependencies.getMediaMetadata(current.path)
      if (!metadata) throw new Error('媒体文件已不存在或无法读取')
      await this.updateStage(itemId, activeStage, 'ready')

      activeStage = 'subtitle'
      await this.updateStage(itemId, activeStage, 'processing', '正在检查字幕 sidecar…')
      const subtitle = await this.dependencies.resolveSubtitle(current.path)
      if (subtitle?.status === 'ready') {
        await this.updateStage(itemId, activeStage, 'ready', `已发现 ${subtitle.cueCount} 条字幕`)
      } else if (subtitle?.status === 'invalid') {
        await this.updateStage(itemId, activeStage, 'failed', '字幕 sidecar 无效，将继续建立视觉索引')
      } else {
        await this.updateStage(itemId, activeStage, 'skipped', '未发现字幕 sidecar')
      }

      activeStage = 'vision'
      await this.updateStage(itemId, activeStage, 'processing', '正在建立视觉索引和缩略图…')
      const result = await this.dependencies.runVisionIndex(current.path, controller.signal, (progress) => {
        this.dependencies.onProgress?.({ itemId, stage: 'vision', status: 'processing', progress, message: progress.message })
      })
      if (result.status !== 'completed') throw new Error(result.message ?? '视觉索引未完成')
      await this.updateStage(itemId, activeStage, 'ready', result.message)

      current = this.dependencies.store.transition(itemId, 'ready', undefined, this.now)
      await this.dependencies.store.persist()
      this.emitItem(current)
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      await this.updateStage(itemId, activeStage, 'failed', message)
      current = this.dependencies.store.transition(itemId, 'failed', message, this.now)
      await this.dependencies.store.persist()
      this.emitItem(current)
    } finally {
      if (this.activeController === controller) this.activeController = null
    }
  }
}

export function createDefaultMediaImportInboxProcessorDependencies(
  store: MediaImportInboxStore,
  resourcePath: string,
  runVisionIndex: MediaImportInboxProcessorDependencies['runVisionIndex'],
  callbacks: Pick<MediaImportInboxProcessorDependencies, 'onItemChanged' | 'onProgress'> = {}
): MediaImportInboxProcessorDependencies {
  return {
    store,
    getMediaMetadata: (mediaPath) => createMediaProbeMetadata(mediaPath, { resourcePath, env: process.env }),
    resolveSubtitle: resolveMediaSubtitleSidecar,
    runVisionIndex,
    ...callbacks
  }
}
