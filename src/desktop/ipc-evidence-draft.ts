import { app, ipcMain } from 'electron'
import { createHash } from 'node:crypto'
import { mkdir, stat, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { writeVtt } from '../core/ai/subtitle-writer'
import { IPC_CHANNELS } from '../shared/ipc-channels'
import type { MediaEvidenceDraft, MediaEvidenceDraftSaveRequest } from '../shared/evidence-task-types'
import { createMediaFile } from './media/media-protocol'

async function getSourceFingerprint(mediaPath: string): Promise<string> {
  const fileStat = await stat(mediaPath)
  return createHash('sha256').update(`${mediaPath}|${fileStat.size}|${fileStat.mtimeMs}`).digest('hex').slice(0, 24)
}

function normalizeRequest(request: MediaEvidenceDraftSaveRequest): MediaEvidenceDraftSaveRequest {
  if (!request || typeof request.mediaPath !== 'string' || !request.mediaPath.trim()) throw new Error('字幕草稿缺少媒体路径')
  if (typeof request.sourceFingerprint !== 'string' || !request.sourceFingerprint.trim()) throw new Error('字幕草稿缺少媒体指纹')
  if (!Number.isFinite(request.startSeconds) || request.startSeconds < 0 || !Number.isFinite(request.endSeconds) || request.endSeconds <= request.startSeconds) {
    throw new Error('字幕草稿时间范围无效')
  }
  const text = typeof request.text === 'string' ? request.text.trim() : ''
  if (!text) throw new Error('字幕草稿内容不能为空')
  if (text.length > 20_000) throw new Error('字幕草稿内容过长')
  return {
    mediaPath: request.mediaPath.trim(),
    sourceFingerprint: request.sourceFingerprint.trim(),
    startSeconds: Math.round(request.startSeconds * 1000) / 1000,
    endSeconds: Math.round(request.endSeconds * 1000) / 1000,
    text
  }
}

export function registerEvidenceDraftIpc(): void {
  ipcMain.handle(IPC_CHANNELS.EVIDENCE_DRAFT_SAVE, async (_event, request: MediaEvidenceDraftSaveRequest): Promise<MediaEvidenceDraft> => {
    const normalized = normalizeRequest(request)
    const currentFingerprint = await getSourceFingerprint(normalized.mediaPath)
    if (currentFingerprint !== normalized.sourceFingerprint) throw new Error('媒体已变化，字幕草稿未保存')

    const id = `tts-draft-${createHash('sha256').update(`${normalized.sourceFingerprint}|${normalized.startSeconds}|${normalized.endSeconds}|${normalized.text}`).digest('hex').slice(0, 24)}`
    const directoryPath = join(app.getPath('userData'), 'evidence-drafts')
    const draftPath = join(directoryPath, `${id}.vtt`)
    await mkdir(directoryPath, { recursive: true })
    await writeFile(draftPath, writeVtt([{ startSeconds: normalized.startSeconds, endSeconds: normalized.endSeconds, text: normalized.text }]), 'utf8')
    const draftFile = createMediaFile(draftPath)
    return { id, ...normalized, draftPath, draftUrl: draftFile.url, createdAt: Date.now() }
  })
}
