import { app, ipcMain } from 'electron'
import { createHash } from 'node:crypto'
import { stat } from 'node:fs/promises'
import { join } from 'node:path'
import { createMediaEvidenceTask } from '../core/ai/evidence-task'
import { runMediaEvidenceTask } from '../core/ai/evidence-task-runner'
import { createLocalOcrOperation, createLocalTtsOperation, probeLocalEvidenceCapabilities } from '../core/ai/local-evidence-adapters'
import { resolveFfmpegPath } from '../core/ai/whisper-cpp-runtime'
import { IPC_CHANNELS } from '../shared/ipc-channels'
import type { MediaEvidenceCapabilities, MediaEvidenceRange, MediaEvidenceTask, MediaEvidenceTaskRequest } from '../shared/evidence-task-types'
import { desktopState } from './desktop-state'
import { resolveResourcePath } from './desktop-services'

function commandFromEnvironment(name: string, fallback: string): string {
  return process.env[name]?.trim() || fallback
}

function resolveTtsCommand(): string {
  return commandFromEnvironment('AIVPLAYER_TTS_PATH', process.platform === 'darwin' ? 'say' : '')
}

function resolveTesseractCommand(): string {
  return commandFromEnvironment('AIVPLAYER_TESSERACT_PATH', 'tesseract')
}

async function getSourceFingerprint(mediaPath: string): Promise<string> {
  const fileStat = await stat(mediaPath)
  return createHash('sha256').update(`${mediaPath}|${fileStat.size}|${fileStat.mtimeMs}`).digest('hex').slice(0, 24)
}

function normalizeRequest(request: MediaEvidenceTaskRequest): MediaEvidenceTaskRequest | null {
  if (!request || (request.kind !== 'ocr' && request.kind !== 'tts')) return null
  if (typeof request.mediaPath !== 'string' || !request.mediaPath.trim()) return null
  if (typeof request.inputHash !== 'string' || !request.inputHash.trim()) return null
  if (request.inputText !== undefined && typeof request.inputText !== 'string') return null
  const ranges = Array.isArray(request.ranges)
    ? request.ranges.filter((range): range is MediaEvidenceRange => Boolean(range) && typeof range.startSeconds === 'number' && typeof range.endSeconds === 'number')
    : []
  return {
    kind: request.kind,
    mediaPath: request.mediaPath.trim(),
    inputHash: request.inputHash.trim(),
    ...(request.inputText?.trim() ? { inputText: request.inputText.trim() } : {}),
    ranges,
    maxRetries: request.maxRetries
  }
}

async function resolveFfmpeg(): Promise<string> {
  try {
    return await resolveFfmpegPath(resolveResourcePath(), process.env, undefined) ?? ''
  } catch {
    return ''
  }
}

async function getCapabilities(): Promise<MediaEvidenceCapabilities> {
  const tesseractPath = resolveTesseractCommand()
  const ttsPath = resolveTtsCommand()
  const capabilities = await probeLocalEvidenceCapabilities({ tesseractPath, ttsPath })
  if (!(await resolveFfmpeg())) capabilities.ocr = { available: false, command: tesseractPath, message: '找不到 FFmpeg，无法抽取 OCR 画面' }
  if (!ttsPath) capabilities.tts = { available: false, command: '', message: '当前平台没有配置 TTS provider' }
  return capabilities
}

function sendTask(sender: Electron.WebContents, task: MediaEvidenceTask): void {
  if (!sender.isDestroyed()) sender.send(IPC_CHANNELS.EVIDENCE_TASK_PROGRESS, task)
}

export function registerEvidenceTaskIpc(): void {
  ipcMain.handle(IPC_CHANNELS.EVIDENCE_TASK_CAPABILITIES, (): Promise<MediaEvidenceCapabilities> => getCapabilities())
  ipcMain.handle(IPC_CHANNELS.EVIDENCE_TASK_START, async (event, request: MediaEvidenceTaskRequest): Promise<MediaEvidenceTask> => {
    const normalized = normalizeRequest(request)
    if (!normalized) throw new Error('媒体证据任务参数无效')
    const sourceFingerprint = await getSourceFingerprint(normalized.mediaPath)
    const task = createMediaEvidenceTask({ ...normalized, sourceFingerprint }, Date.now())
    const senderId = event.sender.id
    desktopState.evidenceTaskAbortControllers.get(senderId)?.abort()
    const controller = new AbortController()
    desktopState.evidenceTaskAbortControllers.set(senderId, controller)
    sendTask(event.sender, task)
    try {
      const ffmpegPath = await resolveFfmpeg()
      const tesseractPath = resolveTesseractCommand()
      const ttsPath = resolveTtsCommand()
      return await runMediaEvidenceTask(task, {
        signal: controller.signal,
        ocr: ffmpegPath && tesseractPath ? createLocalOcrOperation({ ffmpegPath, tesseractPath, temporaryDirectory: app.getPath('temp') }) : undefined,
        tts: ttsPath ? createLocalTtsOperation({ executablePath: ttsPath, outputDirectory: join(app.getPath('userData'), 'evidence-audio') }) : undefined,
        onTaskChange: (next) => sendTask(event.sender, next)
      })
    } finally {
      if (desktopState.evidenceTaskAbortControllers.get(senderId) === controller) desktopState.evidenceTaskAbortControllers.delete(senderId)
    }
  })
  ipcMain.handle(IPC_CHANNELS.EVIDENCE_TASK_CANCEL, (event): boolean => {
    const controller = desktopState.evidenceTaskAbortControllers.get(event.sender.id)
    if (!controller) return false
    controller.abort()
    return true
  })
}
