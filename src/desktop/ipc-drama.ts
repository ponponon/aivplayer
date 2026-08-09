import { ipcMain } from 'electron'
import { IPC_CHANNELS } from '../shared/ipc-channels'
import type {
  DramaCreateProjectInput,
  DramaAssetInput,
  DramaAssetPatch,
  DramaGenerationTaskInput,
  DramaGenerationTaskPatch,
  DramaImportChapterInput,
  DramaProgress,
  DramaProviderSettingsInput
} from '../shared/drama-types'
import { parseDramaChapters } from '../core/drama/drama-text'
import { getDramaProviderSettings, getDramaStore, getDramaWorkflow, saveDramaProviderSettings, testDramaProvider } from './desktop-services'

function requireProjectId(projectId: unknown): string {
  if (typeof projectId !== 'string' || !projectId.trim()) throw new Error('短剧项目 ID 不能为空')
  return projectId.trim()
}

function normalizeCreateInput(input: DramaCreateProjectInput): DramaCreateProjectInput {
  if (!input || typeof input !== 'object') throw new Error('短剧项目参数无效')
  if (typeof input.title !== 'string' || !input.title.trim()) throw new Error('短剧项目名称不能为空')
  return {
    title: input.title,
    intro: typeof input.intro === 'string' ? input.intro : '',
    genre: typeof input.genre === 'string' ? input.genre : '',
    episodeCount: input.episodeCount,
    episodeDurationSeconds: input.episodeDurationSeconds
  }
}

function normalizeChapters(value: unknown): DramaImportChapterInput[] {
  if (!Array.isArray(value)) throw new Error('章节数据必须是数组')
  return value.map((chapter, index) => {
    if (!chapter || typeof chapter !== 'object') throw new Error(`第${index + 1}条章节数据无效`)
    const item = chapter as Partial<DramaImportChapterInput>
    if (!Number.isInteger(item.chapterIndex) || (item.chapterIndex as number) <= 0) throw new Error(`第${index + 1}条章节编号无效`)
    if (typeof item.title !== 'string' || typeof item.content !== 'string') throw new Error(`第${index + 1}条章节缺少标题或正文`)
    return {
      chapterIndex: item.chapterIndex as number,
      volume: typeof item.volume === 'string' ? item.volume : '',
      title: item.title,
      content: item.content
    }
  })
}

function normalizeAssetInput(value: unknown): DramaAssetInput {
  if (!value || typeof value !== 'object') throw new Error('短剧资产参数无效')
  const input = value as Partial<DramaAssetInput>
  if (!['character', 'location', 'prop'].includes(input.assetType ?? '')) throw new Error('短剧资产类型无效')
  if (typeof input.name !== 'string' || !input.name.trim()) throw new Error('短剧资产名称不能为空')
  return {
    assetType: input.assetType as DramaAssetInput['assetType'],
    name: input.name,
    description: typeof input.description === 'string' ? input.description : '',
    visualPrompt: typeof input.visualPrompt === 'string' ? input.visualPrompt : ''
  }
}

function normalizeAssetPatch(value: unknown): DramaAssetPatch {
  if (!value || typeof value !== 'object') throw new Error('短剧资产修改参数无效')
  const patch = value as Partial<DramaAssetPatch>
  if (patch.assetType != null && !['character', 'location', 'prop'].includes(patch.assetType)) throw new Error('短剧资产类型无效')
  if (patch.status != null && !['draft', 'ready'].includes(patch.status)) throw new Error('短剧资产状态无效')
  for (const field of ['name', 'description', 'visualPrompt'] as const) {
    if (patch[field] != null && typeof patch[field] !== 'string') throw new Error('短剧资产字段必须是文本')
  }
  return patch as DramaAssetPatch
}

function normalizeGenerationTaskInput(value: unknown): DramaGenerationTaskInput {
  if (!value || typeof value !== 'object') throw new Error('生成任务参数无效')
  const input = value as Partial<DramaGenerationTaskInput>
  if (!['image', 'video', 'audio'].includes(input.mediaType ?? '')) throw new Error('生成任务媒体类型无效')
  if (typeof input.prompt !== 'string' || !input.prompt.trim()) throw new Error('生成任务提示词不能为空')
  if (input.targetId != null && typeof input.targetId !== 'string') throw new Error('生成任务目标无效')
  if (input.message != null && typeof input.message !== 'string') throw new Error('生成任务说明必须是文本')
  return input as DramaGenerationTaskInput
}

function normalizeGenerationTaskPatch(value: unknown): DramaGenerationTaskPatch {
  if (!value || typeof value !== 'object') throw new Error('生成任务修改参数无效')
  const patch = value as Partial<DramaGenerationTaskPatch>
  if (patch.status != null && !['queued', 'running', 'completed', 'failed', 'cancelled'].includes(patch.status)) throw new Error('生成任务状态无效')
  if (patch.progress != null && (typeof patch.progress !== 'number' || !Number.isFinite(patch.progress))) throw new Error('生成任务进度无效')
  for (const field of ['message', 'resultPath', 'error'] as const) {
    if (patch[field] != null && typeof patch[field] !== 'string') throw new Error('生成任务字段必须是文本')
  }
  return patch as DramaGenerationTaskPatch
}

function sendProgress(event: Electron.IpcMainInvokeEvent, progress: DramaProgress): void {
  if (!event.sender.isDestroyed()) event.sender.send(IPC_CHANNELS.DRAMA_PROGRESS, progress)
}

export function registerDramaIpc(): void {
  getDramaStore().recoverGenerationTasks()
  ipcMain.handle(IPC_CHANNELS.DRAMA_LIST_PROJECTS, () => getDramaStore().listProjects())
  ipcMain.handle(IPC_CHANNELS.DRAMA_CREATE_PROJECT, (_event, input: DramaCreateProjectInput) => getDramaStore().createProject(normalizeCreateInput(input)))
  ipcMain.handle(IPC_CHANNELS.DRAMA_IMPORT_CHAPTERS, (_event, projectId: string, chapters: unknown) => getDramaStore().importChapters(requireProjectId(projectId), normalizeChapters(chapters)))
  ipcMain.handle(IPC_CHANNELS.DRAMA_IMPORT_TEXT, (_event, projectId: string, text: unknown) => {
    if (typeof text !== 'string') throw new Error('小说正文必须是文本')
    const chapters = parseDramaChapters(text)
    return getDramaStore().importChapters(requireProjectId(projectId), chapters)
  })
  ipcMain.handle(IPC_CHANNELS.DRAMA_GET_PROJECT_DATA, (_event, projectId: string) => {
    const normalizedProjectId = requireProjectId(projectId)
    const store = getDramaStore()
    const project = store.getProject(normalizedProjectId)
    if (!project) throw new Error(`短剧项目不存在：${normalizedProjectId}`)
    return { project, chapters: store.listChapters(normalizedProjectId), plan: store.getPlan(normalizedProjectId), scripts: store.listScripts(normalizedProjectId), assets: store.listAssets(normalizedProjectId), storyboards: store.listStoryboards(normalizedProjectId), generationTasks: store.listGenerationTasks(normalizedProjectId) }
  })
  ipcMain.handle(IPC_CHANNELS.DRAMA_GENERATE_EVENTS, async (event, projectId: string, force?: boolean) =>
    getDramaWorkflow().extractEvents(requireProjectId(projectId), { force: force === true, onProgress: (progress) => sendProgress(event, progress) }))
  ipcMain.handle(IPC_CHANNELS.DRAMA_GENERATE_SKELETON, async (event, projectId: string, force?: boolean) =>
    getDramaWorkflow().generateSkeleton(requireProjectId(projectId), { force: force === true, onProgress: (progress) => sendProgress(event, progress) }))
  ipcMain.handle(IPC_CHANNELS.DRAMA_GENERATE_ADAPTATION, async (event, projectId: string, force?: boolean) =>
    getDramaWorkflow().generateAdaptationStrategy(requireProjectId(projectId), { force: force === true, onProgress: (progress) => sendProgress(event, progress) }))
  ipcMain.handle(IPC_CHANNELS.DRAMA_GENERATE_SCRIPT, async (event, projectId: string, episodeIndex: number, force?: boolean) =>
    getDramaWorkflow().generateScript(requireProjectId(projectId), episodeIndex, { force: force === true, onProgress: (progress) => sendProgress(event, progress) }))
  ipcMain.handle(IPC_CHANNELS.DRAMA_GENERATE_ASSETS, async (event, projectId: string, force?: boolean) =>
    getDramaWorkflow().extractAssets(requireProjectId(projectId), { force: force === true, onProgress: (progress) => sendProgress(event, progress) }))
  ipcMain.handle(IPC_CHANNELS.DRAMA_CREATE_ASSET, (_event, projectId: string, input: unknown) =>
    getDramaStore().createAsset(requireProjectId(projectId), normalizeAssetInput(input)))
  ipcMain.handle(IPC_CHANNELS.DRAMA_UPDATE_ASSET, (_event, projectId: string, assetId: string, patch: unknown) =>
    getDramaStore().updateAsset(requireProjectId(projectId), requireProjectId(assetId), normalizeAssetPatch(patch)))
  ipcMain.handle(IPC_CHANNELS.DRAMA_DELETE_ASSET, (_event, projectId: string, assetId: string) => {
    getDramaStore().deleteAsset(requireProjectId(projectId), requireProjectId(assetId))
  })
  ipcMain.handle(IPC_CHANNELS.DRAMA_CREATE_GENERATION_TASK, (_event, projectId: string, input: unknown) =>
    getDramaStore().createGenerationTask(requireProjectId(projectId), normalizeGenerationTaskInput(input)))
  ipcMain.handle(IPC_CHANNELS.DRAMA_CLAIM_GENERATION_TASK, (_event, projectId: string, mediaType: unknown) => {
    if (!['image', 'video', 'audio'].includes(String(mediaType))) throw new Error('生成任务媒体类型无效')
    return getDramaStore().claimNextGenerationTask(requireProjectId(projectId), mediaType as 'image' | 'video' | 'audio')
  })
  ipcMain.handle(IPC_CHANNELS.DRAMA_UPDATE_GENERATION_TASK, (_event, projectId: string, taskId: string, patch: unknown) =>
    getDramaStore().updateGenerationTask(requireProjectId(projectId), requireProjectId(taskId), normalizeGenerationTaskPatch(patch)))
  ipcMain.handle(IPC_CHANNELS.DRAMA_CANCEL_GENERATION_TASK, (_event, projectId: string, taskId: string) =>
    getDramaStore().cancelGenerationTask(requireProjectId(projectId), requireProjectId(taskId)))
  ipcMain.handle(IPC_CHANNELS.DRAMA_GENERATE_STORYBOARD, async (event, projectId: string, episodeIndex: number, force?: boolean) =>
    getDramaWorkflow().generateStoryboard(requireProjectId(projectId), episodeIndex, { force: force === true, onProgress: (progress) => sendProgress(event, progress) }))
  ipcMain.handle(IPC_CHANNELS.DRAMA_GET_PROVIDER_SETTINGS, () => getDramaProviderSettings())
  ipcMain.handle(IPC_CHANNELS.DRAMA_SET_PROVIDER_SETTINGS, (_event, input: DramaProviderSettingsInput) => saveDramaProviderSettings(input ?? {}))
  ipcMain.handle(IPC_CHANNELS.DRAMA_TEST_PROVIDER, () => testDramaProvider())
}
