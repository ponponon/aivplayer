import { EDITING_PUNCH_IN_MAX_SCALE, EDITING_PUNCH_IN_MIN_SCALE, EDITING_PROJECT_SCHEMA_VERSION, EDITING_TRANSITION_MAX_DURATION, EDITING_TRANSITION_MIN_DURATION, type EditingCaption, type EditingClipFilter, type EditingClipTransition, type EditingGraphic, type EditingProject, type EditingScriptSegment, type EditingSource, type EditingVideoBlock, type EditingVideoBlockMotion, type EditingVideoClip } from '../../shared/editing-types'
import { EDITING_TRANSITION_TYPES } from './transition-operations'
import { EDITING_VIDEO_BLOCK_MAX_BORDER_RADIUS, EDITING_VIDEO_BLOCK_MAX_BORDER_WIDTH, EDITING_VIDEO_BLOCK_MAX_SIZE_PERCENT, EDITING_VIDEO_BLOCK_MIN_BORDER_RADIUS, EDITING_VIDEO_BLOCK_MIN_BORDER_WIDTH, EDITING_VIDEO_BLOCK_MIN_SIZE_PERCENT, EDITING_VIDEO_BLOCK_MOTION_MAX_DURATION, EDITING_VIDEO_BLOCK_MOTION_MIN_DURATION, EDITING_VIDEO_BLOCK_MOTIONS } from './video-block-operations'

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function isFiniteNonNegative(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0
}

function parseClipFilter(value: unknown): EditingClipFilter | null {
  if (!isRecord(value)) return null
  for (const key of ['brightness', 'contrast', 'saturate'] as const) if (value[key] !== undefined && (typeof value[key] !== 'number' || !Number.isFinite(value[key]) || value[key] < 0.5 || value[key] > 1.5)) return null
  const brightness = value.brightness as number | undefined
  const contrast = value.contrast as number | undefined
  const saturate = value.saturate as number | undefined
  return { ...(brightness === undefined ? {} : { brightness }), ...(contrast === undefined ? {} : { contrast }), ...(saturate === undefined ? {} : { saturate }) }
}

function parseClipTransition(value: unknown): EditingClipTransition | null {
  if (!isRecord(value) || typeof value.type !== 'string' || !EDITING_TRANSITION_TYPES.includes(value.type as EditingClipTransition['type']) || typeof value.durationSeconds !== 'number' || !Number.isFinite(value.durationSeconds) || value.durationSeconds < EDITING_TRANSITION_MIN_DURATION || value.durationSeconds > EDITING_TRANSITION_MAX_DURATION) return null
  return { type: value.type as EditingClipTransition['type'], durationSeconds: value.durationSeconds }
}

function parseGraphic(value: unknown): EditingGraphic | null {
  if (!isRecord(value) || !isNonEmptyString(value.id) || !isFiniteNonNegative(value.startSeconds) || !isFiniteNonNegative(value.durationSeconds) || value.durationSeconds <= 0 || !isNonEmptyString(value.text)) return null
  if (value.position !== 'center' && value.position !== 'top-left' && value.position !== 'top-right' && value.position !== 'bottom-left' && value.position !== 'bottom-right') return null
  if (value.style !== 'title' && value.style !== 'label') return null
  return { id: value.id, startSeconds: value.startSeconds, durationSeconds: value.durationSeconds, text: value.text, position: value.position, style: value.style }
}

function parseVideoBlock(value: unknown, sourceIds: Set<string>): EditingVideoBlock | null {
  if (!isRecord(value) || !isNonEmptyString(value.id) || !isNonEmptyString(value.sourceId) || !sourceIds.has(value.sourceId) || !isFiniteNonNegative(value.sourceStartSeconds) || !isFiniteNonNegative(value.sourceEndSeconds) || value.sourceEndSeconds <= value.sourceStartSeconds || !isFiniteNonNegative(value.startSeconds) || !isFiniteNonNegative(value.durationSeconds) || value.durationSeconds <= 0 || value.sourceEndSeconds - value.sourceStartSeconds < 0.2) return null
  if (value.durationSeconds > value.sourceEndSeconds - value.sourceStartSeconds + 0.01) return null
  if (value.position !== 'top-left' && value.position !== 'top-right' && value.position !== 'bottom-left' && value.position !== 'bottom-right' && value.position !== 'split-left' && value.position !== 'split-right') return null
  if (value.sizePercent !== undefined && (typeof value.sizePercent !== 'number' || !Number.isFinite(value.sizePercent) || value.sizePercent < EDITING_VIDEO_BLOCK_MIN_SIZE_PERCENT || value.sizePercent > EDITING_VIDEO_BLOCK_MAX_SIZE_PERCENT)) return null
  if (value.borderRadius !== undefined && (typeof value.borderRadius !== 'number' || !Number.isFinite(value.borderRadius) || value.borderRadius < EDITING_VIDEO_BLOCK_MIN_BORDER_RADIUS || value.borderRadius > EDITING_VIDEO_BLOCK_MAX_BORDER_RADIUS)) return null
  if (value.borderWidth !== undefined && (typeof value.borderWidth !== 'number' || !Number.isFinite(value.borderWidth) || value.borderWidth < EDITING_VIDEO_BLOCK_MIN_BORDER_WIDTH || value.borderWidth > EDITING_VIDEO_BLOCK_MAX_BORDER_WIDTH)) return null
  if (value.enterMotion !== undefined && (typeof value.enterMotion !== 'string' || !EDITING_VIDEO_BLOCK_MOTIONS.includes(value.enterMotion as typeof EDITING_VIDEO_BLOCK_MOTIONS[number]))) return null
  if (value.exitMotion !== undefined && (typeof value.exitMotion !== 'string' || !EDITING_VIDEO_BLOCK_MOTIONS.includes(value.exitMotion as typeof EDITING_VIDEO_BLOCK_MOTIONS[number]))) return null
  if (value.motionDurationSeconds !== undefined && (typeof value.motionDurationSeconds !== 'number' || !Number.isFinite(value.motionDurationSeconds) || value.motionDurationSeconds < EDITING_VIDEO_BLOCK_MOTION_MIN_DURATION || value.motionDurationSeconds > EDITING_VIDEO_BLOCK_MOTION_MAX_DURATION)) return null
  const enterMotion = value.enterMotion as EditingVideoBlockMotion | undefined
  const exitMotion = value.exitMotion as EditingVideoBlockMotion | undefined
  return { id: value.id, sourceId: value.sourceId, sourceStartSeconds: value.sourceStartSeconds, sourceEndSeconds: value.sourceEndSeconds, startSeconds: value.startSeconds, durationSeconds: value.durationSeconds, position: value.position, ...(value.sizePercent === undefined ? {} : { sizePercent: value.sizePercent }), ...(value.borderRadius === undefined ? {} : { borderRadius: value.borderRadius }), ...(value.borderWidth === undefined ? {} : { borderWidth: value.borderWidth }), ...(enterMotion === undefined ? {} : { enterMotion }), ...(exitMotion === undefined ? {} : { exitMotion }), ...(value.motionDurationSeconds === undefined ? {} : { motionDurationSeconds: value.motionDurationSeconds }) }
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
  if (value.treatment !== undefined && value.treatment !== 'full' && value.treatment !== 'punch-in') return null
  if (value.treatmentScale !== undefined && (typeof value.treatmentScale !== 'number' || !Number.isFinite(value.treatmentScale) || value.treatmentScale < EDITING_PUNCH_IN_MIN_SCALE || value.treatmentScale > EDITING_PUNCH_IN_MAX_SCALE)) return null
  if (value.treatmentAnchor !== undefined && value.treatmentAnchor !== 'left' && value.treatmentAnchor !== 'center' && value.treatmentAnchor !== 'right') return null
  const filter = value.filter === undefined ? undefined : parseClipFilter(value.filter)
  if (value.filter !== undefined && filter === null) return null
  const transitionIn = value.transitionIn === undefined ? undefined : parseClipTransition(value.transitionIn)
  if (value.transitionIn !== undefined && transitionIn === null) return null
  return { id: value.id, sourceId: value.sourceId, sourceStartSeconds: value.sourceStartSeconds, sourceEndSeconds: value.sourceEndSeconds, ...(value.volume === undefined ? {} : { volume: value.volume }), ...(value.muted === undefined ? {} : { muted: value.muted }), ...(value.treatment === undefined ? {} : { treatment: value.treatment }), ...(value.treatmentScale === undefined ? {} : { treatmentScale: value.treatmentScale }), ...(value.treatmentAnchor === undefined ? {} : { treatmentAnchor: value.treatmentAnchor }), ...(filter === undefined ? {} : { filter: filter as EditingClipFilter }), ...(transitionIn === undefined ? {} : { transitionIn: transitionIn as EditingClipTransition }) }
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

function parseScriptSegment(value: unknown, sourceIds: Set<string>): EditingScriptSegment | null {
  if (!isRecord(value) || !isNonEmptyString(value.id) || !isNonEmptyString(value.sourceId) || !sourceIds.has(value.sourceId) || !isFiniteNonNegative(value.sourceStartSeconds) || !isFiniteNonNegative(value.sourceEndSeconds) || value.sourceEndSeconds <= value.sourceStartSeconds || !isNonEmptyString(value.text)) return null
  if (value.translationText !== undefined && typeof value.translationText !== 'string') return null
  if (value.deleted !== undefined && typeof value.deleted !== 'boolean') return null
  return {
    id: value.id,
    sourceId: value.sourceId,
    sourceStartSeconds: value.sourceStartSeconds,
    sourceEndSeconds: value.sourceEndSeconds,
    text: value.text,
    ...(value.translationText === undefined ? {} : { translationText: value.translationText }),
    ...(value.deleted === undefined ? {} : { deleted: value.deleted })
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
  if (value.scriptSegments !== undefined && !Array.isArray(value.scriptSegments)) throw new Error('Invalid editing project script segments')
  const scriptSegments = value.scriptSegments === undefined ? undefined : value.scriptSegments.map((segment) => parseScriptSegment(segment, sourceIds))
  if (scriptSegments?.some((segment): segment is null => segment === null)) throw new Error('Invalid editing project script segment')
  if (value.graphics !== undefined && !Array.isArray(value.graphics)) throw new Error('Invalid editing project graphics')
  const graphics = value.graphics === undefined ? undefined : value.graphics.map(parseGraphic)
  if (graphics?.some((graphic): graphic is null => graphic === null)) throw new Error('Invalid editing project graphic')
  if (value.videoBlocks !== undefined && !Array.isArray(value.videoBlocks)) throw new Error('Invalid editing project video blocks')
  const videoBlocks = value.videoBlocks === undefined ? undefined : value.videoBlocks.map((block) => parseVideoBlock(block, sourceIds))
  if (videoBlocks?.some((block): block is null => block === null)) throw new Error('Invalid editing project video block')
  return {
    schemaVersion: EDITING_PROJECT_SCHEMA_VERSION,
    id: value.id,
    title: value.title,
    createdAt: value.createdAt,
    updatedAt: value.updatedAt,
    sources: parsedSources,
    videoClips: videoClips as EditingVideoClip[],
    captions: captions as EditingCaption[],
    ...(scriptSegments === undefined ? {} : { scriptSegments: scriptSegments as EditingScriptSegment[] }),
    ...(graphics === undefined ? {} : { graphics: graphics as EditingGraphic[] }),
    ...(videoBlocks === undefined ? {} : { videoBlocks: videoBlocks as EditingVideoBlock[] })
  }
}

export function parseEditingProjectFile(text: string): EditingProject {
  return parseEditingProject(JSON.parse(text) as unknown)
}

export function serializeEditingProject(project: EditingProject): string {
  return `${JSON.stringify(parseEditingProject(project), null, 2)}\n`
}
