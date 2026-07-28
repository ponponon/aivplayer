import { EDITING_PROJECT_SCHEMA_VERSION, type EditingCaption, type EditingProject, type EditingSource, type EditingVideoClip } from '../../shared/editing-types'

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function isFiniteNonNegative(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0
}

function parseSource(value: unknown): EditingSource | null {
  if (!isRecord(value) || !isNonEmptyString(value.id) || !isNonEmptyString(value.path) || !isNonEmptyString(value.name) || !isNonEmptyString(value.fingerprint) || !isFiniteNonNegative(value.durationSeconds)) return null
  if (value.width !== undefined && !isFiniteNonNegative(value.width)) return null
  if (value.height !== undefined && !isFiniteNonNegative(value.height)) return null
  return {
    id: value.id,
    path: value.path,
    name: value.name,
    fingerprint: value.fingerprint,
    durationSeconds: value.durationSeconds,
    ...(value.width === undefined ? {} : { width: value.width }),
    ...(value.height === undefined ? {} : { height: value.height })
  }
}

function parseVideoClip(value: unknown, sourceIds: Set<string>): EditingVideoClip | null {
  if (!isRecord(value) || !isNonEmptyString(value.id) || !isNonEmptyString(value.sourceId) || !sourceIds.has(value.sourceId) || !isFiniteNonNegative(value.sourceStartSeconds) || !isFiniteNonNegative(value.sourceEndSeconds) || value.sourceEndSeconds <= value.sourceStartSeconds) return null
  if (value.volume !== undefined && (typeof value.volume !== 'number' || !Number.isFinite(value.volume) || value.volume < 0 || value.volume > 1)) return null
  if (value.muted !== undefined && typeof value.muted !== 'boolean') return null
  return { id: value.id, sourceId: value.sourceId, sourceStartSeconds: value.sourceStartSeconds, sourceEndSeconds: value.sourceEndSeconds, ...(value.volume === undefined ? {} : { volume: value.volume }), ...(value.muted === undefined ? {} : { muted: value.muted }) }
}

function parseCaption(value: unknown, sourceIds: Set<string>): EditingCaption | null {
  if (!isRecord(value) || !isNonEmptyString(value.id) || !isFiniteNonNegative(value.startSeconds) || !isFiniteNonNegative(value.durationSeconds) || value.durationSeconds <= 0 || !isNonEmptyString(value.text) || (value.kind !== 'source' && value.kind !== 'translation')) return null
  if (value.sourceId !== undefined && (!isNonEmptyString(value.sourceId) || !sourceIds.has(value.sourceId))) return null
  if ((value.sourceStartSeconds === undefined) !== (value.sourceEndSeconds === undefined)) return null
  if (value.sourceStartSeconds !== undefined && (!isFiniteNonNegative(value.sourceStartSeconds) || !isFiniteNonNegative(value.sourceEndSeconds) || value.sourceEndSeconds <= value.sourceStartSeconds)) return null
  const sourceRange = value.sourceStartSeconds === undefined ? {} : { sourceStartSeconds: value.sourceStartSeconds as number, sourceEndSeconds: value.sourceEndSeconds as number }
  return {
    id: value.id,
    startSeconds: value.startSeconds,
    durationSeconds: value.durationSeconds,
    ...(value.sourceId === undefined ? {} : { sourceId: value.sourceId }),
    ...sourceRange,
    text: value.text,
    kind: value.kind
  }
}

export function parseEditingProject(value: unknown): EditingProject {
  if (!isRecord(value) || value.schemaVersion !== EDITING_PROJECT_SCHEMA_VERSION || !isNonEmptyString(value.id) || !isNonEmptyString(value.title) || !isFiniteNonNegative(value.createdAt) || !isFiniteNonNegative(value.updatedAt) || !Array.isArray(value.sources) || value.sources.length === 0 || !Array.isArray(value.videoClips) || !Array.isArray(value.captions)) throw new Error('Invalid AIVPlayer editing project')
  const sources = value.sources.map(parseSource)
  if (sources.some((source): source is null => source === null)) throw new Error('Invalid editing project source')
  const parsedSources = sources as EditingSource[]
  const sourceIds = new Set(parsedSources.map((source) => source.id))
  const videoClips = value.videoClips.map((clip) => parseVideoClip(clip, sourceIds))
  if (videoClips.some((clip): clip is null => clip === null)) throw new Error('Invalid editing project clip')
  const captions = value.captions.map((caption) => parseCaption(caption, sourceIds))
  if (captions.some((caption): caption is null => caption === null)) throw new Error('Invalid editing project caption')
  return {
    schemaVersion: EDITING_PROJECT_SCHEMA_VERSION,
    id: value.id,
    title: value.title,
    createdAt: value.createdAt,
    updatedAt: value.updatedAt,
    sources: parsedSources,
    videoClips: videoClips as EditingVideoClip[],
    captions: captions as EditingCaption[]
  }
}

export function parseEditingProjectFile(text: string): EditingProject {
  return parseEditingProject(JSON.parse(text) as unknown)
}

export function serializeEditingProject(project: EditingProject): string {
  return `${JSON.stringify(parseEditingProject(project), null, 2)}\n`
}
