import type { EditingPersonMatte } from '../../shared/editing-types'

export const EDITING_PERSON_MATTE_PROVIDER_ID = 'modnet-webgpu-v1' as const
export const EDITING_PERSON_MATTE_SAMPLE_FPS = 15
export const EDITING_PERSON_MATTE_DEFAULT_FEATHER_PERCENT = 0
export const EDITING_PERSON_MATTE_DEFAULT_OUTLINE_WIDTH_PERCENT = 0
export const EDITING_PERSON_MATTE_DEFAULT_OUTLINE_COLOR = '#ffffff'
export const EDITING_PERSON_MATTE_MAX_FEATHER_PERCENT = 12
export const EDITING_PERSON_MATTE_MAX_OUTLINE_WIDTH_PERCENT = 4

export type EditingPersonMatteCacheKeyInput = {
  sourceFingerprint: string
  sourceStartSeconds: number
  sourceEndSeconds: number
  providerId?: string
  sampleFps?: number
}

export function getEditingPersonMatteSettings(value: EditingPersonMatte | null | undefined): Required<EditingPersonMatte> {
  return {
    enabled: value?.enabled === true,
    featherPercent: clampPercent(value?.featherPercent, EDITING_PERSON_MATTE_DEFAULT_FEATHER_PERCENT, EDITING_PERSON_MATTE_MAX_FEATHER_PERCENT),
    outlineWidthPercent: clampPercent(value?.outlineWidthPercent, EDITING_PERSON_MATTE_DEFAULT_OUTLINE_WIDTH_PERCENT, EDITING_PERSON_MATTE_MAX_OUTLINE_WIDTH_PERCENT),
    outlineColor: normalizeOutlineColor(value?.outlineColor)
  }
}

/** Uses the same minimum-canvas-dimension mapping as the FFmpeg outline pass. */
export function getEditingPersonMatteOutlinePixels(value: EditingPersonMatte | null | undefined, width?: number, height?: number): number {
  const outlineWidthPercent = getEditingPersonMatteSettings(value).outlineWidthPercent
  if (outlineWidthPercent <= 0) return 0
  const dimensions = [width, height].filter((dimension): dimension is number => typeof dimension === 'number' && Number.isFinite(dimension) && dimension >= 2)
  const minimumDimension = dimensions.length > 0 ? Math.min(...dimensions) : 720
  return Math.max(1, Math.round(outlineWidthPercent * minimumDimension / 200))
}

export function getEditingPersonMatteCacheKey(input: EditingPersonMatteCacheKeyInput): string {
  const providerId = input.providerId?.trim() || EDITING_PERSON_MATTE_PROVIDER_ID
  const sampleFps = Number.isFinite(input.sampleFps) && input.sampleFps! > 0 ? input.sampleFps! : EDITING_PERSON_MATTE_SAMPLE_FPS
  return [
    'person-matte',
    providerId,
    input.sourceFingerprint,
    formatCacheSeconds(input.sourceStartSeconds),
    formatCacheSeconds(input.sourceEndSeconds),
    formatCacheNumber(sampleFps)
  ].join('|')
}

export function isEditingPersonMatte(value: unknown): value is EditingPersonMatte {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false
  const candidate = value as Record<string, unknown>
  if (typeof candidate.enabled !== 'boolean') return false
  if (candidate.featherPercent !== undefined && !isFiniteInRange(candidate.featherPercent, 0, EDITING_PERSON_MATTE_MAX_FEATHER_PERCENT)) return false
  if (candidate.outlineWidthPercent !== undefined && !isFiniteInRange(candidate.outlineWidthPercent, 0, EDITING_PERSON_MATTE_MAX_OUTLINE_WIDTH_PERCENT)) return false
  if (candidate.outlineColor !== undefined && !isOutlineColor(candidate.outlineColor)) return false
  return true
}

function clampPercent(value: number | undefined, fallback: number, maximum: number): number {
  if (!Number.isFinite(value)) return fallback
  return Math.min(maximum, Math.max(0, value as number))
}

function normalizeOutlineColor(value: string | undefined): string {
  return isOutlineColor(value) ? value!.toLowerCase() : EDITING_PERSON_MATTE_DEFAULT_OUTLINE_COLOR
}

function isFiniteInRange(value: unknown, minimum: number, maximum: number): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= minimum && value <= maximum
}

function isOutlineColor(value: unknown): value is string {
  return typeof value === 'string' && /^#[0-9a-f]{6}$/i.test(value)
}

function formatCacheSeconds(value: number): string {
  return formatCacheNumber(Number.isFinite(value) ? Math.max(0, value) : 0)
}

function formatCacheNumber(value: number): string {
  return value.toFixed(3).replace(/0+$/, '').replace(/\.$/, '')
}
