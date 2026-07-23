import type { AsrSubtitleTranslationRequest } from '../shared/asr-types'
import { getCliOption, hasCliOption, type ParsedCliArgs } from './cli-parser'

export type BatchSubtitleFormat = 'both' | 'vtt' | 'srt'

export type BatchPlan = {
  inputs: string[]
  recursive: boolean
  asr: boolean
  translateLanguage?: AsrSubtitleTranslationRequest['targetLanguage']
  sourceLanguage: string
  index: boolean
  format: BatchSubtitleFormat
  outputDirectory?: string
  modelId?: string
  language?: string
  intervalSeconds: number
  retryCount: number
  force: boolean
  failFast: boolean
  stateFile?: string
  resume: boolean
  resetState: boolean
}

export class BatchPlanError extends Error {
  readonly exitCode: number

  constructor(message: string, exitCode = 2) {
    super(message)
    this.name = 'BatchPlanError'
    this.exitCode = exitCode
  }
}

function normalizeTargetLanguage(value: string | undefined): BatchPlan['translateLanguage'] {
  const aliases: Record<string, NonNullable<BatchPlan['translateLanguage']>> = {
    zh: 'zh',
    'zh-CN': 'zh',
    en: 'en',
    'en-US': 'en',
    ja: 'ja',
    'ja-JP': 'ja',
    ko: 'ko',
    'ko-KR': 'ko'
  }
  const normalized = value ? aliases[value] : undefined
  if (!normalized) throw new BatchPlanError('--translate 必须是 zh、en、ja 或 ko')
  return normalized
}

function parseFormat(parsed: ParsedCliArgs): BatchSubtitleFormat {
  const format = getCliOption(parsed, 'format') ?? 'both'
  if (format !== 'both' && format !== 'vtt' && format !== 'srt') {
    throw new BatchPlanError('--format 只能是 both、vtt 或 srt')
  }
  return format
}

function parseInterval(parsed: ParsedCliArgs): number {
  const interval = Number(getCliOption(parsed, 'interval') ?? 3)
  if (!Number.isFinite(interval) || interval <= 0) throw new BatchPlanError('--interval 必须是大于 0 的数字')
  return interval
}

function parseRetryCount(parsed: ParsedCliArgs): number {
  const value = getCliOption(parsed, 'retry')
  if (hasCliOption(parsed, 'retry') && value == null) {
    throw new BatchPlanError('--retry 需要指定重试次数')
  }
  const retryCount = Number(value ?? 2)
  if (!Number.isInteger(retryCount) || retryCount < 0 || retryCount > 5) {
    throw new BatchPlanError('--retry 必须是 0 到 5 之间的整数')
  }
  return retryCount
}

export function parseBatchPlan(parsed: ParsedCliArgs): BatchPlan {
  if (parsed.positionals.length === 0) {
    throw new BatchPlanError('缺少输入路径。用法：aivcli batch <directory-or-video...> --asr [--translate zh] [--index]')
  }

  const asr = hasCliOption(parsed, 'asr')
  const translateOption = hasCliOption(parsed, 'translate')
  const translateLanguage = translateOption ? normalizeTargetLanguage(getCliOption(parsed, 'translate')) : undefined
  const index = hasCliOption(parsed, 'index')
  if (!asr && !translateOption && !index) {
    throw new BatchPlanError('至少指定一个任务：--asr、--translate <language> 或 --index')
  }

  const outputDirectoryValue = getCliOption(parsed, 'output-dir')
  const sourceLanguage = getCliOption(parsed, 'from') ?? 'auto'
  const failFast = hasCliOption(parsed, 'fail-fast')
  if (hasCliOption(parsed, 'continue-on-error') && failFast) {
    throw new BatchPlanError('--fail-fast 和 --continue-on-error 不能同时使用')
  }
  const resume = hasCliOption(parsed, 'resume')
  const resetState = hasCliOption(parsed, 'reset-state')
  if (resume && resetState) throw new BatchPlanError('--resume 和 --reset-state 不能同时使用')
  if (resume && hasCliOption(parsed, 'force')) throw new BatchPlanError('--resume 和 --force 不能同时使用；如需强制重跑，请使用 --reset-state --force')
  const stateFile = getCliOption(parsed, 'state-file')
  if (hasCliOption(parsed, 'state-file') && !stateFile) throw new BatchPlanError('--state-file 需要指定文件路径')

  return {
    inputs: parsed.positionals,
    recursive: hasCliOption(parsed, 'recursive') && !hasCliOption(parsed, 'no-recursive'),
    asr,
    translateLanguage,
    sourceLanguage,
    index,
    format: parseFormat(parsed),
    outputDirectory: outputDirectoryValue,
    modelId: getCliOption(parsed, 'model'),
    language: getCliOption(parsed, 'language') === 'auto' ? undefined : getCliOption(parsed, 'language'),
    intervalSeconds: parseInterval(parsed),
    retryCount: parseRetryCount(parsed),
    force: hasCliOption(parsed, 'force'),
    failFast,
    stateFile,
    resume,
    resetState
  }
}
