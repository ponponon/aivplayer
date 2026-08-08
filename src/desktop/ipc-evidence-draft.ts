import { app, ipcMain } from 'electron'
import { createHash } from 'node:crypto'
import { mkdir, readdir, readFile, rename, stat, unlink, writeFile } from 'node:fs/promises'
import { basename, dirname, extname, join, resolve } from 'node:path'
import { writeSrt, writeVtt } from '../core/ai/subtitle-writer'
import { createMediaEvidenceDraftId, normalizeMediaEvidenceDraftCues, summarizeMediaEvidenceDraftCues } from '../core/ai/media-evidence-draft'
import { IPC_CHANNELS } from '../shared/ipc-channels'
import type {
  MediaEvidenceDraft,
  MediaEvidenceDraftCue,
  MediaEvidenceDraftImportRequest,
  MediaEvidenceDraftImportResult,
  MediaEvidenceDraftSaveRequest
} from '../shared/evidence-task-types'
import { createMediaFile } from './media/media-protocol'

const DRAFT_ID_PATTERN = /^tts-draft-[a-f0-9]{24}$/

type StoredMediaEvidenceDraft = Omit<MediaEvidenceDraft, 'draftUrl' | 'draftPath'>
type NormalizedMediaEvidenceDraftRequest = {
  mediaPath: string
  sourceFingerprint: string
  cues: MediaEvidenceDraftCue[]
}

function getDraftDirectoryPath(): string {
  return join(app.getPath('userData'), 'evidence-drafts')
}

function getDraftPath(directoryPath: string, draftId: string): string {
  return join(directoryPath, `${draftId}.vtt`)
}

function getDraftManifestPath(directoryPath: string, draftId: string): string {
  return join(directoryPath, `${draftId}.json`)
}

function normalizeDraftId(value: unknown): string {
  if (typeof value !== 'string' || !DRAFT_ID_PATTERN.test(value)) throw new Error('字幕草稿 ID 无效')
  return value
}

function normalizeRequest(request: MediaEvidenceDraftSaveRequest): NormalizedMediaEvidenceDraftRequest {
  if (!request || typeof request.mediaPath !== 'string' || !request.mediaPath.trim()) throw new Error('字幕草稿缺少媒体路径')
  if (typeof request.sourceFingerprint !== 'string' || !request.sourceFingerprint.trim()) throw new Error('字幕草稿缺少媒体指纹')
  const rawCues = request.cues ?? [
    { startSeconds: request.startSeconds, endSeconds: request.endSeconds, text: request.text }
  ]
  return {
    mediaPath: request.mediaPath.trim(),
    sourceFingerprint: request.sourceFingerprint.trim(),
    cues: normalizeMediaEvidenceDraftCues(rawCues)
  }
}

function normalizeImportRequest(request: MediaEvidenceDraftImportRequest): MediaEvidenceDraftImportRequest {
  if (!request || typeof request.mediaPath !== 'string' || !request.mediaPath.trim()) throw new Error('字幕草稿导入缺少媒体路径')
  return {
    draftId: normalizeDraftId(request.draftId),
    mediaPath: request.mediaPath.trim(),
    overwriteExisting: request.overwriteExisting === true
  }
}

function toStoredDraft(draft: MediaEvidenceDraft): StoredMediaEvidenceDraft {
  const { draftPath: _draftPath, draftUrl: _draftUrl, ...stored } = draft
  return stored
}

function toDraft(directoryPath: string, raw: unknown): MediaEvidenceDraft | null {
  if (!raw || typeof raw !== 'object') return null
  const value = raw as Partial<StoredMediaEvidenceDraft>
  if (
    typeof value.id !== 'string' || !DRAFT_ID_PATTERN.test(value.id) ||
    typeof value.mediaPath !== 'string' || !value.mediaPath ||
    typeof value.sourceFingerprint !== 'string' || !value.sourceFingerprint ||
    typeof value.createdAt !== 'number' || !Number.isFinite(value.createdAt)
  ) return null

  let cues: MediaEvidenceDraftCue[]
  try {
    cues = normalizeMediaEvidenceDraftCues(value.cues ?? [{ startSeconds: value.startSeconds, endSeconds: value.endSeconds, text: value.text }])
  } catch {
    return null
  }
  const summary = summarizeMediaEvidenceDraftCues(cues)

  const draftPath = getDraftPath(directoryPath, value.id)
  return {
    id: value.id,
    mediaPath: value.mediaPath,
    sourceFingerprint: value.sourceFingerprint,
    cues,
    ...summary,
    draftPath,
    draftUrl: createMediaFile(draftPath).url,
    createdAt: value.createdAt
  }
}

async function writeAtomic(filePath: string, content: string): Promise<void> {
  const temporaryPath = `${filePath}.${process.pid}.${Date.now()}.tmp`
  await writeFile(temporaryPath, content, 'utf8')
  await rename(temporaryPath, filePath)
}

async function getSourceFingerprint(mediaPath: string): Promise<string> {
  const fileStat = await stat(mediaPath)
  return createHash('sha256').update(`${mediaPath}|${fileStat.size}|${fileStat.mtimeMs}`).digest('hex').slice(0, 24)
}

async function readDraft(directoryPath: string, draftId: string): Promise<MediaEvidenceDraft | null> {
  try {
    const content = await readFile(getDraftManifestPath(directoryPath, draftId), 'utf8')
    return toDraft(directoryPath, JSON.parse(content))
  } catch {
    return null
  }
}

async function listDrafts(directoryPath: string): Promise<MediaEvidenceDraft[]> {
  let entries
  try {
    entries = await readdir(directoryPath, { withFileTypes: true })
  } catch {
    return []
  }

  const drafts = await Promise.all(entries
    .filter((entry) => entry.isFile() && entry.name.endsWith('.json'))
    .map(async (entry) => readDraft(directoryPath, entry.name.slice(0, -'.json'.length))))
  return drafts.filter((draft): draft is MediaEvidenceDraft => draft !== null).sort((left, right) => right.createdAt - left.createdAt)
}

async function pathExists(filePath: string): Promise<boolean> {
  try {
    await stat(filePath)
    return true
  } catch {
    return false
  }
}

function getFormalSubtitlePaths(mediaPath: string): { subtitlePath: string; subtitleSrtPath: string } {
  const stem = join(dirname(mediaPath), basename(mediaPath, extname(mediaPath)))
  return { subtitlePath: `${stem}.vtt`, subtitleSrtPath: `${stem}.srt` }
}

async function importDraft(directoryPath: string, request: MediaEvidenceDraftImportRequest): Promise<MediaEvidenceDraftImportResult> {
  const draft = await readDraft(directoryPath, request.draftId)
  if (!draft) throw new Error('字幕草稿不存在或已损坏')
  if (resolve(draft.mediaPath) !== resolve(request.mediaPath)) throw new Error('字幕草稿不属于当前媒体')
  if (await getSourceFingerprint(draft.mediaPath) !== draft.sourceFingerprint) {
    return { success: false, message: '媒体已变化，字幕草稿未导入' }
  }

  const { subtitlePath, subtitleSrtPath } = getFormalSubtitlePaths(draft.mediaPath)
  const existingSubtitlePaths = (await Promise.all([
    pathExists(subtitlePath).then((exists) => exists ? subtitlePath : null),
    pathExists(subtitleSrtPath).then((exists) => exists ? subtitleSrtPath : null)
  ])).filter((path): path is string => path !== null)
  if (existingSubtitlePaths.length > 0 && !request.overwriteExisting) {
    return {
      success: false,
      message: '正式字幕已存在，请确认覆盖',
      requiresOverwriteConfirmation: true,
      existingSubtitlePaths,
      draft
    }
  }

  const subtitleContent = writeVtt(draft.cues)
  await writeAtomic(subtitlePath, subtitleContent)
  await writeAtomic(subtitleSrtPath, writeSrt(draft.cues))
  const subtitleFile = createMediaFile(subtitlePath)
  const subtitleSrtFile = createMediaFile(subtitleSrtPath)
  return {
    success: true,
    message: '字幕草稿已导入正式字幕',
    draft,
    subtitlePath,
    subtitleSrtPath,
    subtitleUrl: subtitleFile.url,
    subtitleSrtUrl: subtitleSrtFile.url
  }
}

export function registerEvidenceDraftIpc(): void {
  ipcMain.handle(IPC_CHANNELS.EVIDENCE_DRAFT_SAVE, async (_event, request: MediaEvidenceDraftSaveRequest): Promise<MediaEvidenceDraft> => {
    const normalized = normalizeRequest(request)
    const currentFingerprint = await getSourceFingerprint(normalized.mediaPath)
    if (currentFingerprint !== normalized.sourceFingerprint) throw new Error('媒体已变化，字幕草稿未保存')

    const id = createMediaEvidenceDraftId(normalized.sourceFingerprint, normalized.cues)
    const directoryPath = getDraftDirectoryPath()
    const draftPath = getDraftPath(directoryPath, id)
    const draft = { id, ...normalized, ...summarizeMediaEvidenceDraftCues(normalized.cues), draftPath, draftUrl: createMediaFile(draftPath).url, createdAt: Date.now() }
    await mkdir(directoryPath, { recursive: true })
    await writeAtomic(draftPath, writeVtt(normalized.cues))
    await writeAtomic(getDraftManifestPath(directoryPath, id), `${JSON.stringify(toStoredDraft(draft), null, 2)}\n`)
    return draft
  })
  ipcMain.handle(IPC_CHANNELS.EVIDENCE_DRAFT_LIST, async (): Promise<MediaEvidenceDraft[]> => listDrafts(getDraftDirectoryPath()))
  ipcMain.handle(IPC_CHANNELS.EVIDENCE_DRAFT_DELETE, async (_event, draftId: string): Promise<boolean> => {
    const normalizedDraftId = normalizeDraftId(draftId)
    const directoryPath = getDraftDirectoryPath()
    const draft = await readDraft(directoryPath, normalizedDraftId)
    if (!draft) return false
    await Promise.all([
      unlink(getDraftManifestPath(directoryPath, normalizedDraftId)).catch(() => undefined),
      unlink(getDraftPath(directoryPath, normalizedDraftId)).catch(() => undefined)
    ])
    return true
  })
  ipcMain.handle(IPC_CHANNELS.EVIDENCE_DRAFT_IMPORT, async (_event, request: MediaEvidenceDraftImportRequest): Promise<MediaEvidenceDraftImportResult> => importDraft(getDraftDirectoryPath(), normalizeImportRequest(request)))
}
