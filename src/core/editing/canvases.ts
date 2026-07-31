import type { EditingCanvasPresetId } from '../../shared/editing-types'

export const EDITING_CANVAS_PRESET_IDS: readonly EditingCanvasPresetId[] = ['source', 'landscape', 'portrait', 'square']

export type EditingCanvasPreset = {
  id: EditingCanvasPresetId
  ratio: string
  summary: string
  fitMode: 'contain' | 'cover'
}

export type EditingCanvasDimensions = {
  width: number
  height: number
  ratio: string
  fitMode: 'contain' | 'cover'
}

export const BUILTIN_EDITING_CANVASES: readonly EditingCanvasPreset[] = [
  { id: 'source', ratio: 'source', summary: 'Keep the source canvas', fitMode: 'contain' },
  { id: 'landscape', ratio: '16:9', summary: 'Landscape short-video canvas', fitMode: 'cover' },
  { id: 'portrait', ratio: '9:16', summary: 'Portrait short-video canvas', fitMode: 'cover' },
  { id: 'square', ratio: '1:1', summary: 'Square social canvas', fitMode: 'cover' }
]

export function isEditingCanvasPresetId(value: unknown): value is EditingCanvasPresetId {
  return typeof value === 'string' && EDITING_CANVAS_PRESET_IDS.includes(value as EditingCanvasPresetId)
}

export function getEditingCanvasPreset(id: EditingCanvasPresetId | string | null | undefined): EditingCanvasPreset {
  return BUILTIN_EDITING_CANVASES.find((preset) => preset.id === id) ?? BUILTIN_EDITING_CANVASES[0]!
}

function evenDimension(value: number): number {
  return Math.max(2, Math.floor(Math.max(2, value) / 2) * 2)
}

function normalizeSourceDimension(value: number | undefined, fallback: number): number {
  return Number.isFinite(value) && (value ?? 0) >= 2 ? evenDimension(value as number) : fallback
}

export function getEditingCanvasDimensions(id: EditingCanvasPresetId | string | null | undefined, sourceWidth?: number, sourceHeight?: number): EditingCanvasDimensions {
  const preset = getEditingCanvasPreset(id)
  const width = normalizeSourceDimension(sourceWidth, 1920)
  const height = normalizeSourceDimension(sourceHeight, 1080)
  if (preset.id === 'source') return { width, height, ratio: `${width}:${height}`, fitMode: 'contain' }
  if (preset.id === 'square') {
    const side = evenDimension(Math.min(width, height))
    return { width: side, height: side, ratio: '1:1', fitMode: preset.fitMode }
  }
  const longEdge = Math.max(width, height)
  if (preset.id === 'portrait') {
    const canvasHeight = evenDimension(longEdge)
    return { width: evenDimension(canvasHeight * 9 / 16), height: canvasHeight, ratio: '9:16', fitMode: preset.fitMode }
  }
  const canvasWidth = evenDimension(longEdge)
  return { width: canvasWidth, height: evenDimension(canvasWidth * 9 / 16), ratio: '16:9', fitMode: preset.fitMode }
}
