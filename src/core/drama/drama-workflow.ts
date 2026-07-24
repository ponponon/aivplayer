import type {
  DramaChapter,
  DramaChapterEvent,
  DramaAssetInput,
  DramaProgress,
  DramaScript,
  DramaStoryboard,
  DramaStoryboardInput,
  DramaStageResult,
  DramaTask
} from '../../shared/drama-types'
import { DramaProviderError, type DramaTextProvider } from './drama-provider'
import { DramaStore } from './drama-store'
import {
  adaptationSystemPrompt,
  adaptationUserPrompt,
  eventSystemPrompt,
  eventUserPrompt,
  assetSystemPrompt,
  assetUserPrompt,
  scriptSystemPrompt,
  scriptUserPrompt,
  skeletonSystemPrompt,
  skeletonUserPrompt,
  storyboardSystemPrompt,
  storyboardUserPrompt
} from './drama-prompts'

export type DramaWorkflowOptions = {
  force?: boolean
  signal?: AbortSignal
  onProgress?: (progress: DramaProgress) => void
}

export class DramaWorkflow {
  constructor(private readonly store: DramaStore, private readonly provider: DramaTextProvider) {}

  async extractEvents(projectId: string, options: DramaWorkflowOptions = {}): Promise<DramaStageResult> {
    const chapters = this.requireChapters(projectId)
    const result = this.createResult(projectId, 'events')
    const selected = chapters
    for (let index = 0; index < selected.length; index += 1) {
      const chapter = selected[index] as DramaChapter
      this.throwIfAborted(options.signal)
      if (chapter.eventStatus === 'completed' && chapter.event && !options.force) {
        result.skipped += 1
        this.report(options, { stage: 'events', current: index + 1, total: selected.length, message: `跳过已完成事件：第${chapter.chapterIndex}章` })
        continue
      }
      const task = this.store.startTask(projectId, 'events', chapter.id, `提取第${chapter.chapterIndex}章事件`)
      this.store.setChapterEvent(chapter.id, 'running')
      try {
        const raw = await this.provider.generate({ stage: 'events', system: eventSystemPrompt(), user: eventUserPrompt(chapter), signal: options.signal })
        const event = parseEvent(raw)
        this.store.setChapterEvent(chapter.id, 'completed', event)
        this.store.finishTask(task.id, 'completed', `第${chapter.chapterIndex}章事件提取完成`)
        result.completed += 1
      } catch (error) {
        const message = errorMessage(error)
        this.store.setChapterEvent(chapter.id, 'failed', undefined, message)
        this.store.finishTask(task.id, 'failed', `第${chapter.chapterIndex}章事件提取失败`, message)
        result.failed += 1
        result.errors.push({ targetId: chapter.id, message })
        if (isAbortError(error)) throw error
      }
      this.report(options, { stage: 'events', current: index + 1, total: selected.length, message: `已处理第${chapter.chapterIndex}章事件` })
    }
    return result
  }

  async generateSkeleton(projectId: string, options: DramaWorkflowOptions = {}): Promise<{ result: DramaStageResult; skeleton: string }> {
    const project = this.requireProject(projectId)
    const chapters = this.requireChapters(projectId)
    const existing = this.store.getPlan(projectId)
    if (existing?.storySkeleton && !options.force) {
      return { result: { ...this.createResult(projectId, 'skeleton'), skipped: 1 }, skeleton: existing.storySkeleton }
    }
    return this.generatePlanField(projectId, 'skeleton', skeletonSystemPrompt(), skeletonUserPrompt(project, chapters), (value) => stringField(value, 'storySkeleton'), options)
  }

  async generateAdaptationStrategy(projectId: string, options: DramaWorkflowOptions = {}): Promise<{ result: DramaStageResult; adaptationStrategy: string }> {
    const project = this.requireProject(projectId)
    const chapters = this.requireChapters(projectId)
    const existing = this.store.getPlan(projectId)
    if (existing?.adaptationStrategy && !options.force) {
      return { result: { ...this.createResult(projectId, 'adaptation'), skipped: 1 }, adaptationStrategy: existing.adaptationStrategy }
    }
    return this.generatePlanField(projectId, 'adaptation', adaptationSystemPrompt(), adaptationUserPrompt(project, existing, chapters), (value) => stringField(value, 'adaptationStrategy'), options)
  }

  async generateScript(projectId: string, episodeIndex: number, options: DramaWorkflowOptions = {}): Promise<{ result: DramaStageResult; script: DramaScript }> {
    if (!Number.isInteger(episodeIndex) || episodeIndex <= 0) throw new Error('集数必须是大于 0 的整数')
    const project = this.requireProject(projectId)
    const chapters = this.requireChapters(projectId)
    const existing = this.store.getScript(projectId, episodeIndex)
    const result = this.createResult(projectId, 'script')
    if (existing?.content && !options.force) return { result: { ...result, skipped: 1 }, script: existing }
    const task = this.store.startTask(projectId, 'script', String(episodeIndex), `生成第${episodeIndex}集剧本`)
    try {
      const raw = await this.provider.generate({ stage: 'script', system: scriptSystemPrompt(), user: scriptUserPrompt(project, this.store.getPlan(projectId), chapters, episodeIndex), signal: options.signal })
      const value = parseRecord(raw)
      const content = stringField(value, 'content', raw)
      const title = stringField(value, 'title', `第${episodeIndex}集`)
      const script = this.store.saveScript(projectId, episodeIndex, title, content)
      this.store.finishTask(task.id, 'completed', `第${episodeIndex}集剧本生成完成`)
      result.completed = 1
      this.report(options, { stage: 'script', current: 1, total: 1, message: `第${episodeIndex}集剧本生成完成` })
      return { result, script }
    } catch (error) {
      const message = errorMessage(error)
      this.store.finishTask(task.id, 'failed', `第${episodeIndex}集剧本生成失败`, message)
      result.failed = 1
      result.errors.push({ targetId: String(episodeIndex), message })
      if (isAbortError(error)) throw error
      throw new Error(`第${episodeIndex}集剧本生成失败：${message}`)
    }
  }

  async extractAssets(projectId: string, options: DramaWorkflowOptions = {}): Promise<DramaStageResult> {
    const project = this.requireProject(projectId)
    const chapters = this.requireChapters(projectId)
    const existing = this.store.listAssets(projectId)
    const result = this.createResult(projectId, 'assets')
    if (existing.length > 0 && !options.force) {
      result.skipped = 1
      this.report(options, { stage: 'assets', current: 1, total: 1, message: `跳过已有资产：${existing.length} 个` })
      return result
    }
    const task = this.store.startTask(projectId, 'assets', undefined, '提取角色、场景和道具资产')
    try {
      this.throwIfAborted(options.signal)
      const raw = await this.provider.generate({ stage: 'assets', system: assetSystemPrompt(), user: assetUserPrompt(project, chapters), signal: options.signal })
      const assets = parseAssets(raw)
      if (assets.length === 0) throw new Error('AI 没有返回有效资产')
      this.store.replaceAssets(projectId, assets)
      this.store.finishTask(task.id, 'completed', `资产提取完成，共 ${assets.length} 个`)
      result.completed = 1
      this.report(options, { stage: 'assets', current: 1, total: 1, message: `资产提取完成，共 ${assets.length} 个` })
      return result
    } catch (error) {
      const message = errorMessage(error)
      this.store.finishTask(task.id, 'failed', '资产提取失败', message)
      result.failed = 1
      result.errors.push({ targetId: projectId, message })
      if (isAbortError(error)) throw error
      throw new Error(`资产提取失败：${message}`)
    }
  }

  async generateStoryboard(projectId: string, episodeIndex: number, options: DramaWorkflowOptions = {}): Promise<{ result: DramaStageResult; storyboard: DramaStoryboard[] }> {
    if (!Number.isInteger(episodeIndex) || episodeIndex <= 0) throw new Error('集数必须是大于 0 的整数')
    const project = this.requireProject(projectId)
    const script = this.store.getScript(projectId, episodeIndex)
    if (!script?.content) throw new Error(`请先生成第${episodeIndex}集剧本`)
    const existing = this.store.listStoryboards(projectId, episodeIndex)
    const result = this.createResult(projectId, 'storyboard')
    if (existing.length > 0 && !options.force) {
      result.skipped = 1
      this.report(options, { stage: 'storyboard', current: 1, total: 1, message: `跳过第${episodeIndex}集已有分镜：${existing.length} 个` })
      return { result, storyboard: existing }
    }
    const task = this.store.startTask(projectId, 'storyboard', String(episodeIndex), `生成第${episodeIndex}集分镜`)
    try {
      this.throwIfAborted(options.signal)
      const raw = await this.provider.generate({ stage: 'storyboard', system: storyboardSystemPrompt(), user: storyboardUserPrompt(project, this.store.getPlan(projectId), script, this.store.listAssets(projectId), episodeIndex), signal: options.signal })
      const scenes = parseStoryboard(raw)
      if (scenes.length === 0) throw new Error('AI 没有返回有效分镜')
      const storyboard = this.store.replaceStoryboard(projectId, episodeIndex, scenes)
      this.store.finishTask(task.id, 'completed', `第${episodeIndex}集分镜生成完成，共 ${storyboard.length} 个镜头`)
      result.completed = 1
      this.report(options, { stage: 'storyboard', current: 1, total: 1, message: `第${episodeIndex}集分镜生成完成，共 ${storyboard.length} 个镜头` })
      return { result, storyboard }
    } catch (error) {
      const message = errorMessage(error)
      this.store.finishTask(task.id, 'failed', `第${episodeIndex}集分镜生成失败`, message)
      result.failed = 1
      result.errors.push({ targetId: String(episodeIndex), message })
      if (isAbortError(error)) throw error
      throw new Error(`第${episodeIndex}集分镜生成失败：${message}`)
    }
  }

  private async generatePlanField(
    projectId: string,
    stage: 'skeleton',
    system: string,
    user: string,
    readValue: (value: Record<string, unknown>) => string,
    options: DramaWorkflowOptions
  ): Promise<{ result: DramaStageResult; skeleton: string }>
  private async generatePlanField(
    projectId: string,
    stage: 'adaptation',
    system: string,
    user: string,
    readValue: (value: Record<string, unknown>) => string,
    options: DramaWorkflowOptions
  ): Promise<{ result: DramaStageResult; adaptationStrategy: string }>
  private async generatePlanField(
    projectId: string,
    stage: 'skeleton' | 'adaptation',
    system: string,
    user: string,
    readValue: (value: Record<string, unknown>) => string,
    options: DramaWorkflowOptions
  ): Promise<{ result: DramaStageResult; skeleton?: string; adaptationStrategy?: string }> {
    const result = this.createResult(projectId, stage)
    const task = this.store.startTask(projectId, stage, undefined, stage === 'skeleton' ? '生成故事骨架' : '生成改编策略')
    try {
      this.throwIfAborted(options.signal)
      const raw = await this.provider.generate({ stage, system, user, signal: options.signal })
      const value = parseRecord(raw)
      const field = readValue(value).trim() || raw.trim()
      if (!field) throw new Error('AI 没有返回有效内容')
      const plan = this.store.getPlan(projectId)
      const next = stage === 'skeleton'
        ? this.store.savePlan(projectId, { storySkeleton: field, adaptationStrategy: plan?.adaptationStrategy ?? '' })
        : this.store.savePlan(projectId, { storySkeleton: plan?.storySkeleton ?? '', adaptationStrategy: field })
      this.store.finishTask(task.id, 'completed', stage === 'skeleton' ? '故事骨架生成完成' : '改编策略生成完成')
      result.completed = 1
      this.report(options, { stage, current: 1, total: 1, message: stage === 'skeleton' ? '故事骨架生成完成' : '改编策略生成完成' })
      return stage === 'skeleton' ? { result, skeleton: next.storySkeleton } : { result, adaptationStrategy: next.adaptationStrategy }
    } catch (error) {
      const message = errorMessage(error)
      this.store.finishTask(task.id, 'failed', stage === 'skeleton' ? '故事骨架生成失败' : '改编策略生成失败', message)
      result.failed = 1
      result.errors.push({ targetId: projectId, message })
      if (isAbortError(error)) throw error
      throw new Error(`${stage === 'skeleton' ? '故事骨架' : '改编策略'}生成失败：${message}`)
    }
  }

  private requireProject(projectId: string) {
    const project = this.store.getProject(projectId)
    if (!project) throw new Error(`短剧项目不存在：${projectId}`)
    return project
  }

  private requireChapters(projectId: string): DramaChapter[] {
    const chapters = this.store.listChapters(projectId)
    if (chapters.length === 0) throw new Error('项目还没有导入章节')
    return chapters
  }

  private createResult(projectId: string, stage: DramaTask['stage']): DramaStageResult {
    return { projectId, stage, completed: 0, skipped: 0, failed: 0, errors: [] }
  }

  private report(options: DramaWorkflowOptions, progress: DramaProgress): void {
    options.onProgress?.(progress)
  }

  private throwIfAborted(signal: AbortSignal | undefined): void {
    if (signal?.aborted) {
      const error = new Error('短剧任务已取消')
      error.name = 'AbortError'
      throw error
    }
  }
}

function parseEvent(raw: string): DramaChapterEvent {
  const value = parseRecord(raw)
  return {
    summary: stringField(value, 'summary', raw),
    characters: stringArrayField(value, 'characters'),
    locations: stringArrayField(value, 'locations'),
    conflict: stringField(value, 'conflict'),
    hook: stringField(value, 'hook')
  }
}

function parseAssets(raw: string): DramaAssetInput[] {
  const value = parseRecord(raw)
  if (!Array.isArray(value.assets)) return []
  const allowed = new Set<DramaAssetInput['assetType']>(['character', 'location', 'prop'])
  const seen = new Set<string>()
  return value.assets.flatMap((item): DramaAssetInput[] => {
    if (!item || typeof item !== 'object') return []
    const record = item as Record<string, unknown>
    const assetType = record.assetType
    const name = typeof record.name === 'string' ? record.name.trim() : ''
    if (typeof assetType !== 'string' || !allowed.has(assetType as DramaAssetInput['assetType']) || !name) return []
    const key = `${assetType}:${name.toLocaleLowerCase()}`
    if (seen.has(key)) return []
    seen.add(key)
    return [{ assetType: assetType as DramaAssetInput['assetType'], name, description: stringField(record, 'description'), visualPrompt: stringField(record, 'visualPrompt') }]
  })
}

function parseStoryboard(raw: string): DramaStoryboardInput[] {
  const value = parseRecord(raw)
  if (!Array.isArray(value.scenes)) return []
  const seen = new Set<number>()
  return value.scenes.flatMap((item, index): DramaStoryboardInput[] => {
    if (!item || typeof item !== 'object') return []
    const record = item as Record<string, unknown>
    const sceneIndex = typeof record.sceneIndex === 'number' && Number.isInteger(record.sceneIndex) && record.sceneIndex > 0 ? record.sceneIndex : index + 1
    if (seen.has(sceneIndex)) return []
    seen.add(sceneIndex)
    return [{
      sceneIndex,
      title: stringField(record, 'title', `场景 ${sceneIndex}`),
      durationSeconds: positiveInteger(record.durationSeconds, 5),
      location: stringField(record, 'location'),
      characters: stringArrayField(record, 'characters'),
      action: stringField(record, 'action'),
      dialogue: stringField(record, 'dialogue'),
      visualPrompt: stringField(record, 'visualPrompt'),
      cameraPrompt: stringField(record, 'cameraPrompt')
    }]
  })
}

function parseRecord(raw: string): Record<string, unknown> {
  const trimmed = raw.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '')
  const candidates = [trimmed]
  const start = trimmed.indexOf('{')
  const end = trimmed.lastIndexOf('}')
  if (start >= 0 && end > start) candidates.push(trimmed.slice(start, end + 1))
  for (const candidate of candidates) {
    try {
      const value = JSON.parse(candidate) as unknown
      if (value && typeof value === 'object' && !Array.isArray(value)) return value as Record<string, unknown>
    } catch {
      // Try the next JSON candidate; raw text remains a valid fallback for text fields.
    }
  }
  return {}
}

function stringField(value: Record<string, unknown>, key: string, fallback = ''): string {
  return typeof value[key] === 'string' && value[key].trim() ? value[key].trim() : fallback
}

function stringArrayField(value: Record<string, unknown>, key: string): string[] {
  return Array.isArray(value[key]) ? value[key].filter((item): item is string => typeof item === 'string' && Boolean(item.trim())).map((item) => item.trim()) : []
}

function positiveInteger(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isInteger(value) && value > 0 ? value : fallback
}

function isAbortError(error: unknown): boolean {
  return error instanceof Error && error.name === 'AbortError'
}

function errorMessage(error: unknown): string {
  if (error instanceof DramaProviderError) return error.message
  return error instanceof Error ? error.message : String(error)
}
