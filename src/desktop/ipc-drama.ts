import { ipcMain } from 'electron'
import { IPC_CHANNELS } from '../shared/ipc-channels'
import type {
  DramaCreateProjectInput,
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

function sendProgress(event: Electron.IpcMainInvokeEvent, progress: DramaProgress): void {
  if (!event.sender.isDestroyed()) event.sender.send(IPC_CHANNELS.DRAMA_PROGRESS, progress)
}

export function registerDramaIpc(): void {
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
    return { project, chapters: store.listChapters(normalizedProjectId), plan: store.getPlan(normalizedProjectId), scripts: store.listScripts(normalizedProjectId), assets: store.listAssets(normalizedProjectId), storyboards: store.listStoryboards(normalizedProjectId) }
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
  ipcMain.handle(IPC_CHANNELS.DRAMA_GENERATE_STORYBOARD, async (event, projectId: string, episodeIndex: number, force?: boolean) =>
    getDramaWorkflow().generateStoryboard(requireProjectId(projectId), episodeIndex, { force: force === true, onProgress: (progress) => sendProgress(event, progress) }))
  ipcMain.handle(IPC_CHANNELS.DRAMA_GET_PROVIDER_SETTINGS, () => getDramaProviderSettings())
  ipcMain.handle(IPC_CHANNELS.DRAMA_SET_PROVIDER_SETTINGS, (_event, input: DramaProviderSettingsInput) => saveDramaProviderSettings(input ?? {}))
  ipcMain.handle(IPC_CHANNELS.DRAMA_TEST_PROVIDER, () => testDramaProvider())
}
