import { randomUUID } from 'node:crypto'
import { mkdir, rename, unlink, writeFile } from 'node:fs/promises'
import { basename, dirname, extname, resolve } from 'node:path'
import type { EditingSubtitleExportKind } from '../../shared/editing-subtitle-export'

export function normalizeEditingSubtitleExportText(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const normalized = value.replace(/\r\n?/gu, '\n').trim()
  return normalized ? `${normalized}\n` : null
}

export function buildEditingSubtitleExportDefaultFileName(mediaPath: string, kind: EditingSubtitleExportKind): string {
  const mediaName = basename(mediaPath.trim()) || 'media'
  const extension = extname(mediaName)
  const stem = (extension ? mediaName.slice(0, -extension.length) : mediaName)
    .replace(/[<>:"/\\|?*\u0000-\u001F]+/gu, '-')
    .replace(/^-+|-+$/gu, '')
    .trim() || 'media'
  return `${stem}-edited-${kind === 'translation' ? 'translation' : 'source'}.srt`
}

function errorCode(error: unknown): string {
  return error && typeof error === 'object' && 'code' in error ? String(error.code) : ''
}

async function replaceFile(temporaryPath: string, outputPath: string): Promise<void> {
  try {
    await rename(temporaryPath, outputPath)
  } catch (error) {
    const code = errorCode(error)
    if (code !== 'EEXIST' && code !== 'EPERM') throw error
    await unlink(outputPath).catch(() => undefined)
    await rename(temporaryPath, outputPath)
  }
}

export async function writeEditingSubtitleFile(outputPath: string, subtitleText: string): Promise<string> {
  const normalizedText = normalizeEditingSubtitleExportText(subtitleText)
  if (!normalizedText) throw new Error('没有可导出的字幕内容')
  const normalizedPath = resolve(outputPath.trim())
  if (!normalizedPath.toLowerCase().endsWith('.srt')) throw new Error('字幕导出路径必须使用 .srt 扩展名')
  await mkdir(dirname(normalizedPath), { recursive: true })
  const temporaryPath = `${normalizedPath}.${process.pid}.${randomUUID()}.tmp`
  try {
    await writeFile(temporaryPath, normalizedText, { encoding: 'utf8', mode: 0o600 })
    await replaceFile(temporaryPath, normalizedPath)
    return normalizedPath
  } finally {
    await unlink(temporaryPath).catch(() => undefined)
  }
}
