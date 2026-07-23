import { readFile, stat } from 'node:fs/promises'
import { resolve } from 'node:path'
import type {
  DramaCreateProjectInput,
  DramaImportChapterInput,
  DramaProjectData,
  DramaStageResult
} from '../shared/drama-types'
import { parseDramaChapters } from '../main/drama/drama-text'
import { getDramaProviderSettings, getDramaStore, getDramaWorkflow, testDramaProvider } from '../main/main-services'
import { getCliOption, hasCliOption, type ParsedCliArgs } from './cli-parser'

type DramaReport = (message: string) => void

function writeStdout(value: string): void {
  process.stdout.write(`${value}\n`)
}

function printJson(parsed: ParsedCliArgs, value: unknown): void {
  if (parsed.global.json) writeStdout(JSON.stringify(value, null, 2))
}

function printHuman(parsed: ParsedCliArgs, value: string): void {
  if (!parsed.global.json) writeStdout(value)
}

function requirePositional(parsed: ParsedCliArgs, index: number, usage: string): string {
  const value = parsed.positionals[index]
  if (!value) throw new Error(`缺少参数。用法：${usage}`)
  return value
}

function positiveInteger(value: string | undefined, optionName: string): number | undefined {
  if (value == null) return undefined
  const parsed = Number(value)
  if (!Number.isInteger(parsed) || parsed <= 0) throw new Error(`${optionName} 必须是大于 0 的整数`)
  return parsed
}

function forceEnabled(parsed: ParsedCliArgs): boolean {
  return hasCliOption(parsed, 'force')
}

function printStageResult(parsed: ParsedCliArgs, result: DramaStageResult): void {
  printJson(parsed, result)
  printHuman(parsed, `${result.stage}：完成 ${result.completed}，跳过 ${result.skipped}，失败 ${result.failed}`)
}

function formatProjectData(data: DramaProjectData): string {
  return [
    `项目：${data.project.title}（${data.project.id}）`,
    `简介：${data.project.intro || '未填写'}`,
    `类型：${data.project.genre || '未填写'}`,
    `章节：${data.chapters.length}`,
    `故事骨架：${data.plan?.storySkeleton ? '已生成' : '未生成'}`,
    `改编策略：${data.plan?.adaptationStrategy ? '已生成' : '未生成'}`,
    `剧本：${data.scripts.length} 集`,
    `资产：${data.assets.length} 个`,
    `分镜：${data.storyboards.length} 个镜头`
  ].join('\n')
}

async function runCreate(parsed: ParsedCliArgs): Promise<number> {
  const title = getCliOption(parsed, 'title') ?? requirePositional(parsed, 1, 'aivcli drama create <title> [--intro text] [--genre name]')
  const input: DramaCreateProjectInput = {
    title,
    intro: getCliOption(parsed, 'intro'),
    genre: getCliOption(parsed, 'genre'),
    episodeCount: positiveInteger(getCliOption(parsed, 'episodes'), '--episodes'),
    episodeDurationSeconds: positiveInteger(getCliOption(parsed, 'duration'), '--duration')
  }
  const project = getDramaStore().createProject(input)
  printJson(parsed, project)
  printHuman(parsed, `已创建短剧项目：${project.title}\n项目 ID：${project.id}`)
  return 0
}

async function runImport(parsed: ParsedCliArgs): Promise<number> {
  const projectId = requirePositional(parsed, 1, 'aivcli drama import <project-id> <novel.txt>')
  const inputPath = resolve(requirePositional(parsed, 2, 'aivcli drama import <project-id> <novel.txt>'))
  const fileStat = await stat(inputPath).catch(() => null)
  if (!fileStat?.isFile()) throw new Error(`小说文件不存在：${inputPath}`)
  const chapters = parseDramaChapters(await readFile(inputPath, 'utf8'))
  const imported = getDramaStore().importChapters(projectId, chapters)
  const payload = { projectId, inputPath, importedCount: imported.length, chapters: imported }
  printJson(parsed, payload)
  printHuman(parsed, `已导入 ${imported.length} 章：${projectId}`)
  return 0
}

async function runShow(parsed: ParsedCliArgs): Promise<number> {
  const projectId = requirePositional(parsed, 1, 'aivcli drama show <project-id>')
  const store = getDramaStore()
  const project = store.getProject(projectId)
  if (!project) throw new Error(`短剧项目不存在：${projectId}`)
  const data: DramaProjectData = { project, chapters: store.listChapters(projectId), plan: store.getPlan(projectId), scripts: store.listScripts(projectId), assets: store.listAssets(projectId), storyboards: store.listStoryboards(projectId) }
  printJson(parsed, data)
  printHuman(parsed, formatProjectData(data))
  return 0
}

async function runGenerate(parsed: ParsedCliArgs, report: DramaReport): Promise<number> {
  const action = parsed.positionals[0]
  const projectId = requirePositional(parsed, 1, `aivcli drama ${action ?? 'events'} generate <project-id>`)
  const workflow = getDramaWorkflow()
  const options = { force: forceEnabled(parsed), onProgress: (progress: { message: string }) => report(progress.message) }

  if (action === 'events') {
    const result = await workflow.extractEvents(projectId, options)
    printStageResult(parsed, result)
    return result.failed > 0 ? 4 : 0
  }
  if (action === 'plan') {
    const stage = getCliOption(parsed, 'stage') ?? 'skeleton'
    if (stage === 'skeleton') {
      const output = await workflow.generateSkeleton(projectId, options)
      printJson(parsed, output)
      printHuman(parsed, `${output.result.skipped ? '跳过' : '完成'}故事骨架生成`)
      return output.result.failed > 0 ? 4 : 0
    }
    if (stage === 'adaptation') {
      const output = await workflow.generateAdaptationStrategy(projectId, options)
      printJson(parsed, output)
      printHuman(parsed, `${output.result.skipped ? '跳过' : '完成'}改编策略生成`)
      return output.result.failed > 0 ? 4 : 0
    }
    throw new Error('--stage 只能是 skeleton 或 adaptation')
  }
  if (action === 'script') {
    const episodeIndex = positiveInteger(getCliOption(parsed, 'episode'), '--episode')
    if (!episodeIndex) throw new Error('script generate 必须提供 --episode')
    const output = await workflow.generateScript(projectId, episodeIndex, options)
    printJson(parsed, output)
    printHuman(parsed, `${output.result.skipped ? '跳过' : '完成'}第${episodeIndex}集剧本生成：${output.script.title}`)
    return output.result.failed > 0 ? 4 : 0
  }
  if (action === 'assets') {
    const result = await workflow.extractAssets(projectId, options)
    printStageResult(parsed, result)
    return result.failed > 0 ? 4 : 0
  }
  if (action === 'storyboard') {
    const episodeIndex = positiveInteger(getCliOption(parsed, 'episode'), '--episode')
    if (!episodeIndex) throw new Error('storyboard generate 必须提供 --episode')
    const output = await workflow.generateStoryboard(projectId, episodeIndex, options)
    printJson(parsed, output)
    printHuman(parsed, `${output.result.skipped ? '跳过' : '完成'}第${episodeIndex}集分镜生成：${output.storyboard.length} 个镜头`)
    return output.result.failed > 0 ? 4 : 0
  }
  throw new Error(`未知的 drama generate 子命令：${action ?? ''}`)
}

async function runPipeline(parsed: ParsedCliArgs, report: DramaReport): Promise<number> {
  const projectId = requirePositional(parsed, 1, 'aivcli drama run <project-id> --episode N')
  const episodeIndex = positiveInteger(getCliOption(parsed, 'episode'), '--episode')
  if (!episodeIndex) throw new Error('drama run 必须提供 --episode')
  const workflow = getDramaWorkflow()
  const options = { force: forceEnabled(parsed), onProgress: (progress: { message: string }) => report(progress.message) }
  const events = await workflow.extractEvents(projectId, options)
  if (events.failed > 0) return 4
  const skeleton = await workflow.generateSkeleton(projectId, options)
  const adaptation = await workflow.generateAdaptationStrategy(projectId, options)
  const script = await workflow.generateScript(projectId, episodeIndex, options)
  const assets = await workflow.extractAssets(projectId, options)
  if (assets.failed > 0) return 4
  const storyboard = await workflow.generateStoryboard(projectId, episodeIndex, options)
  const payload = { projectId, episodeIndex, events, skeleton, adaptation, script, assets, storyboard }
  printJson(parsed, payload)
  printHuman(parsed, `短剧文本流水线完成：第${episodeIndex}集《${script.script.title}》`)
  return 0
}

async function runProvider(parsed: ParsedCliArgs): Promise<number> {
  const action = parsed.positionals[1] ?? 'show'
  const settings = getDramaProviderSettings()
  if (action === 'show') {
    const payload = { ...settings, apiKey: undefined }
    printJson(parsed, payload)
    printHuman(parsed, `接口：${settings.apiBaseUrl ?? '未配置'}\n模型：${settings.model ?? '未配置'}\nMock：${settings.useMock ? '开启' : '关闭'}\nKey：${settings.apiKeyConfigured ? '已配置' : '未配置'}`)
    return 0
  }
  if (action === 'test') {
    const result = await testDramaProvider()
    printJson(parsed, result)
    printHuman(parsed, result.message)
    return result.success ? 0 : 4
  }
  throw new Error(`未知的 drama provider 子命令：${action}`)
}

export async function runDrama(parsed: ParsedCliArgs, report: DramaReport): Promise<number> {
  const action = parsed.positionals[0] ?? 'list'
  if (action === 'list') {
    const projects = getDramaStore().listProjects()
    printJson(parsed, { projects })
    printHuman(parsed, projects.length === 0 ? '暂无短剧项目' : projects.map((project) => `${project.id}\t${project.title}\t${project.status}`).join('\n'))
    return 0
  }
  if (action === 'create') return runCreate(parsed)
  if (action === 'import') return runImport(parsed)
  if (action === 'show') return runShow(parsed)
  if (action === 'provider') return runProvider(parsed)
  if (action === 'run') return runPipeline(parsed, report)
  if (action === 'events' || action === 'plan' || action === 'script' || action === 'assets' || action === 'storyboard') {
    if (parsed.positionals[1] !== 'generate') {
      throw new Error(`用法：aivcli drama ${action} generate ...`)
    }
    const normalized = { ...parsed, positionals: [action, ...parsed.positionals.slice(2)] }
    return runGenerate(normalized, report)
  }
  throw new Error(`未知的 drama 子命令：${action}`)
}
