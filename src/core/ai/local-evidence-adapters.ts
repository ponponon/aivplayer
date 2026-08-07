import { execFile } from 'node:child_process'
import { mkdtemp, mkdir, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { promisify } from 'node:util'
import type { MediaEvidenceCapabilities, MediaEvidenceEngineCapability, TtsAudioArtifact, OcrEvidenceArtifact } from '../../shared/evidence-task-types'
import type { MediaEvidenceTaskOperation } from './evidence-task-runner'

const execFileAsync = promisify(execFile)
const MAX_COMMAND_OUTPUT = 4 * 1024 * 1024

type CommandResult = {
  stdout: string
  stderr: string
}

export type EvidenceCommandRunner = (command: string, args: readonly string[], signal?: AbortSignal) => Promise<CommandResult>

export type LocalOcrAdapterOptions = {
  ffmpegPath: string
  tesseractPath: string
  language?: string
  pageSegmentationMode?: number
  temporaryDirectory?: string
  runCommand?: EvidenceCommandRunner
}

export type LocalTtsAdapterOptions = {
  executablePath: string
  outputDirectory: string
  voice?: string
  dataFormat?: string
  mimeType?: string
  runCommand?: EvidenceCommandRunner
}

export type LocalEvidenceEngineProbe = MediaEvidenceEngineCapability
export type LocalEvidenceCapabilities = MediaEvidenceCapabilities

const defaultRunCommand: EvidenceCommandRunner = async (command, args, signal) => {
  const result = await execFileAsync(command, [...args], { encoding: 'utf8', maxBuffer: MAX_COMMAND_OUTPUT, signal })
  return { stdout: result.stdout, stderr: result.stderr }
}

function abortError(): Error {
  const error = new Error('本地媒体证据处理已取消')
  error.name = 'AbortError'
  return error
}

function throwIfAborted(signal: AbortSignal): void {
  if (signal.aborted) throw abortError()
}

function commandError(command: string, error: unknown): Error {
  if (error instanceof Error) return new Error(`${command} 执行失败：${error.message}`, { cause: error })
  return new Error(`${command} 执行失败：${String(error)}`)
}

function frameFileName(taskId: string, rangeIndex: number): string {
  return `frame-${taskId}-${String(rangeIndex).padStart(4, '0')}.png`
}

async function extractFrame(
  options: LocalOcrAdapterOptions,
  taskId: string,
  mediaPath: string,
  startSeconds: number,
  rangeIndex: number,
  signal: AbortSignal
): Promise<{ workingDirectory: string; framePath: string }> {
  throwIfAborted(signal)
  const workingDirectory = await mkdtemp(join(options.temporaryDirectory ?? tmpdir(), 'aivplayer-ocr-'))
  const framePath = join(workingDirectory, frameFileName(taskId, rangeIndex))
  try {
    await (options.runCommand ?? defaultRunCommand)(options.ffmpegPath, [
      '-hide_banner',
      '-loglevel',
      'error',
      '-y',
      '-ss',
      startSeconds.toFixed(3),
      '-i',
      mediaPath,
      '-frames:v',
      '1',
      '-f',
      'image2',
      '-vcodec',
      'png',
      framePath
    ], signal)
    throwIfAborted(signal)
    return { workingDirectory, framePath }
  } catch (error) {
    await rm(workingDirectory, { recursive: true, force: true })
    if (signal.aborted) throw abortError()
    throw commandError('FFmpeg 抽帧', error)
  }
}

export function createLocalOcrOperation(options: LocalOcrAdapterOptions): MediaEvidenceTaskOperation {
  const runCommand = options.runCommand ?? defaultRunCommand
  const pageSegmentationMode = Number.isInteger(options.pageSegmentationMode) && options.pageSegmentationMode! >= 0 ? options.pageSegmentationMode! : 6

  return async ({ task, range, rangeIndex }, signal): Promise<OcrEvidenceArtifact> => {
    const frame = await extractFrame(options, task.id, task.mediaPath, range.startSeconds, rangeIndex, signal)
    try {
      throwIfAborted(signal)
      const args = [frame.framePath, 'stdout', '--psm', String(pageSegmentationMode)]
      if (options.language?.trim()) args.push('-l', options.language.trim())
      let result: CommandResult
      try {
        result = await runCommand(options.tesseractPath, args, signal)
      } catch (error) {
        if (signal.aborted) throw abortError()
        throw commandError('Tesseract OCR', error)
      }
      throwIfAborted(signal)
      return {
        id: `ocr-${task.id}-${String(rangeIndex).padStart(4, '0')}`,
        artifactType: 'ocr-evidence',
        sourceFingerprint: task.sourceFingerprint,
        startSeconds: range.startSeconds,
        endSeconds: range.endSeconds,
        text: result.stdout,
        frameId: `${task.id}:${rangeIndex}`
      }
    } finally {
      await rm(frame.workingDirectory, { recursive: true, force: true })
    }
  }
}

export function createLocalTtsOperation(options: LocalTtsAdapterOptions): MediaEvidenceTaskOperation {
  const runCommand = options.runCommand ?? defaultRunCommand
  const mimeType = options.mimeType?.trim() || 'audio/aiff'
  const dataFormat = options.dataFormat?.trim()

  return async ({ task, range, rangeIndex, inputText }, signal): Promise<TtsAudioArtifact> => {
    const text = inputText?.trim() ?? ''
    if (!text) throw new Error('TTS 任务缺少 inputText')
    throwIfAborted(signal)
    await mkdir(options.outputDirectory, { recursive: true })
    const audioPath = join(options.outputDirectory, `tts-${task.id}-${String(rangeIndex).padStart(4, '0')}.aiff`)
    const args = ['-o', audioPath]
    if (options.voice?.trim()) args.push('-v', options.voice.trim())
    if (dataFormat) args.push('--data-format', dataFormat)
    args.push(text)
    try {
      await runCommand(options.executablePath, args, signal)
    } catch (error) {
      if (signal.aborted) throw abortError()
      throw commandError('TTS 语音合成', error)
    }
    throwIfAborted(signal)
    return {
      id: `tts-${task.id}-${String(rangeIndex).padStart(4, '0')}`,
      artifactType: 'tts-audio',
      sourceFingerprint: task.sourceFingerprint,
      startSeconds: range.startSeconds,
      endSeconds: range.endSeconds,
      text,
      audioPath,
      mimeType
    }
  }
}

async function probeCommand(command: string, args: readonly string[], runCommand: EvidenceCommandRunner): Promise<LocalEvidenceEngineProbe> {
  try {
    await runCommand(command, args)
    return { available: true, command, message: '可用' }
  } catch (error) {
    return { available: false, command, message: error instanceof Error ? error.message : String(error) }
  }
}

export async function probeLocalEvidenceCapabilities(options: { tesseractPath: string; ttsPath: string; runCommand?: EvidenceCommandRunner }): Promise<LocalEvidenceCapabilities> {
  const runCommand = options.runCommand ?? defaultRunCommand
  const ttsProbeArgs = process.platform === 'darwin' ? ['-v', '?'] : ['--version']
  const [ocr, tts] = await Promise.all([probeCommand(options.tesseractPath, ['--version'], runCommand), probeCommand(options.ttsPath, ttsProbeArgs, runCommand)])
  return { ocr, tts }
}
