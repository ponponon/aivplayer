import { createHash } from 'node:crypto'
import { basename, extname, join } from 'node:path'
import { mkdir, readFile, rename, stat, writeFile } from 'node:fs/promises'
import type { AsrSubtitleSummaryMode, AsrSubtitleSummarySourceType } from '../../shared/media-types.ts'
import type { SubtitleTargetLanguageId } from '../../shared/app-settings.ts'

export type SubtitleCacheManifestAsr = {
  modelId: string
  subtitleLanguage?: string
  subtitlePath: string
  subtitleSrtPath: string
  updatedAt: string
}

export type SubtitleCacheManifestTranslation = {
  sourceSubtitlePath: string
  sourceLanguage: string
  targetLanguage: SubtitleTargetLanguageId
  model: string
  glossaryHash: string
  subtitlePath: string
  subtitleSrtPath: string
  updatedAt: string
}

export type SubtitleCacheManifestSummary = {
  sourceSubtitlePath: string
  sourceLanguage: string
  sourceType: AsrSubtitleSummarySourceType
  targetLanguage: SubtitleTargetLanguageId
  mode: AsrSubtitleSummaryMode
  model: string
  summaryPath: string
  updatedAt: string
}

export type SubtitleCacheManifest = {
  schemaVersion: 1
  media: { path: string; sizeBytes: number; mtimeMs: number }
  asr: SubtitleCacheManifestAsr[]
  translations: SubtitleCacheManifestTranslation[]
  summaries: SubtitleCacheManifestSummary[]
  updatedAt: string
}

export type SubtitleCacheManifestArtifact =
  | ({ kind: 'asr' } & Omit<SubtitleCacheManifestAsr, 'updatedAt'>)
  | ({ kind: 'translation' } & Omit<SubtitleCacheManifestTranslation, 'glossaryHash' | 'updatedAt'> & { glossary?: string | null })
  | ({ kind: 'summary' } & Omit<SubtitleCacheManifestSummary, 'updatedAt'>)

const manifestQueues = new Map<string, Promise<void>>()

function sanitizeFileStem(filePath: string): string {
  const stem = basename(filePath, extname(filePath)).replace(/[^a-zA-Z0-9._-]+/g, '-').replace(/^-+|-+$/g, '')
  return stem || 'media'
}

function hash(value: string): string {
  return createHash('sha1').update(value).digest('hex').slice(0, 16)
}

function artifactKey(artifact: SubtitleCacheManifestArtifact): string {
  if (artifact.kind === 'asr') return ['asr', artifact.modelId, artifact.subtitlePath].join('\n')
  if (artifact.kind === 'translation') return ['translation', artifact.sourceSubtitlePath, artifact.sourceLanguage, artifact.targetLanguage, artifact.model, hash(artifact.glossary ?? ''), artifact.subtitlePath].join('\n')
  return ['summary', artifact.sourceSubtitlePath, artifact.sourceLanguage, artifact.sourceType, artifact.targetLanguage, artifact.mode, artifact.model, artifact.summaryPath].join('\n')
}

function manifestPath(cacheDirectory: string, mediaPath: string, sizeBytes: number, mtimeMs: number): string {
  const mediaKey = hash(`${mediaPath}\n${sizeBytes}\n${mtimeMs}`)
  return join(cacheDirectory, 'index', `${sanitizeFileStem(mediaPath)}-${mediaKey}.json`)
}

async function readManifest(filePath: string, media: SubtitleCacheManifest['media']): Promise<SubtitleCacheManifest> {
  try {
    const parsed = JSON.parse(await readFile(filePath, 'utf8')) as Partial<SubtitleCacheManifest>
    if (parsed.schemaVersion === 1 && parsed.media?.path === media.path && parsed.media.sizeBytes === media.sizeBytes && parsed.media.mtimeMs === media.mtimeMs) {
      return {
        schemaVersion: 1,
        media,
        asr: Array.isArray(parsed.asr) ? parsed.asr : [],
        translations: Array.isArray(parsed.translations) ? parsed.translations : [],
        summaries: Array.isArray(parsed.summaries) ? parsed.summaries : [],
        updatedAt: typeof parsed.updatedAt === 'string' ? parsed.updatedAt : new Date(0).toISOString()
      }
    }
  } catch {
    // A damaged index must never prevent subtitle generation or restoration.
  }
  return { schemaVersion: 1, media, asr: [], translations: [], summaries: [], updatedAt: new Date(0).toISOString() }
}

function upsert<T>(items: T[], item: T, key: (value: T) => string): T[] {
  const next = items.filter((current) => key(current) !== key(item))
  next.push(item)
  return next
}

async function writeManifest(cacheDirectory: string, mediaPath: string, artifact: SubtitleCacheManifestArtifact): Promise<void> {
  const mediaStat = await stat(mediaPath)
  const media = { path: mediaPath, sizeBytes: mediaStat.size, mtimeMs: mediaStat.mtimeMs }
  const filePath = manifestPath(cacheDirectory, mediaPath, media.sizeBytes, media.mtimeMs)
  const current = await readManifest(filePath, media)
  const updatedAt = new Date().toISOString()
  const manifest: SubtitleCacheManifest = { ...current, updatedAt }

  if (artifact.kind === 'asr') {
    const item: SubtitleCacheManifestAsr = { ...artifact, updatedAt }
    manifest.asr = upsert(manifest.asr, item, (value) => `${value.modelId}\n${value.subtitlePath}`)
  } else if (artifact.kind === 'translation') {
    const { glossary, ...translationArtifact } = artifact
    const item: SubtitleCacheManifestTranslation = { ...translationArtifact, glossaryHash: hash(glossary ?? ''), updatedAt }
    manifest.translations = upsert(manifest.translations, item, (value) => ['translation', value.sourceSubtitlePath, value.sourceLanguage, value.targetLanguage, value.model, value.glossaryHash, value.subtitlePath].join('\n'))
  } else {
    const item: SubtitleCacheManifestSummary = { ...artifact, updatedAt }
    manifest.summaries = upsert(manifest.summaries, item, (value) => artifactKey({ kind: 'summary', ...value }))
  }

  await mkdir(join(cacheDirectory, 'index'), { recursive: true })
  const temporaryPath = `${filePath}.${process.pid}.tmp`
  await writeFile(temporaryPath, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8')
  await rename(temporaryPath, filePath)
}

export async function getSubtitleCacheManifestPath(cacheDirectory: string, mediaPath: string): Promise<string> {
  const mediaStat = await stat(mediaPath)
  return manifestPath(cacheDirectory, mediaPath, mediaStat.size, mediaStat.mtimeMs)
}

export function recordSubtitleCacheManifest(options: { cacheDirectory: string; mediaPath?: string; artifact: SubtitleCacheManifestArtifact }): Promise<void> {
  if (!options.mediaPath) return Promise.resolve()
  const queueKey = `${options.cacheDirectory}\n${options.mediaPath}`
  const previous = manifestQueues.get(queueKey) ?? Promise.resolve()
  const next = previous.catch(() => undefined).then(() => writeManifest(options.cacheDirectory, options.mediaPath as string, options.artifact)).catch(() => undefined)
  manifestQueues.set(queueKey, next)
  void next.then(() => {
    if (manifestQueues.get(queueKey) === next) manifestQueues.delete(queueKey)
  })
  return next
}
