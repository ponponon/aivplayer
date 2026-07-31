import type { EditingFrameId } from '../../shared/editing-types'

export type { EditingFrameId } from '../../shared/editing-types'
export type EditingFrameGraphicVariant = 'editorial' | 'sticker' | 'outline' | 'cinema' | 'serif'

export type EditingFrame = {
  id: EditingFrameId
  name: string
  summary: string
  graphicVariant: EditingFrameGraphicVariant
  accent: string
  accentInk: string
  cardBackground: string
  cardText: string
  cardBorder: string
  cardShadow: string
  fontFamily: string
  radius: string
}

export const DEFAULT_EDITING_FRAME_ID: EditingFrameId = 'clean'

export const BUILTIN_EDITING_FRAMES: readonly EditingFrame[] = [
  { id: 'clean', name: '清爽', summary: '编辑感留白与金色细线', graphicVariant: 'editorial', accent: '#e3bd57', accentInk: '#1c180b', cardBackground: 'rgba(10, 10, 10, .58)', cardText: '#ffffff', cardBorder: 'rgba(227, 189, 87, .7)', cardShadow: '0 10px 28px rgba(0, 0, 0, .24)', fontFamily: 'system-ui, -apple-system, "PingFang SC", sans-serif', radius: '6px' },
  { id: 'warm', name: '暖黄', summary: '暖色贴纸与醒目重点', graphicVariant: 'sticker', accent: '#f06f4a', accentInk: '#ffffff', cardBackground: '#f7dba9', cardText: '#2d180f', cardBorder: '#f06f4a', cardShadow: '4px 7px 0 rgba(45, 24, 15, .24)', fontFamily: 'system-ui, -apple-system, "PingFang SC", sans-serif', radius: '3px' },
  { id: 'mint', name: '薄荷', summary: '轻透明框线与清新强调', graphicVariant: 'outline', accent: '#62d8b0', accentInk: '#08271e', cardBackground: 'rgba(5, 38, 32, .72)', cardText: '#effff8', cardBorder: 'rgba(98, 216, 176, .85)', cardShadow: '0 0 0 1px rgba(98, 216, 176, .14), 0 12px 32px rgba(0, 0, 0, .22)', fontFamily: 'system-ui, -apple-system, "PingFang SC", sans-serif', radius: '2px' },
  { id: 'cinema', name: '影院', summary: '深色大标题与冷蓝光泽', graphicVariant: 'cinema', accent: '#8ec5ff', accentInk: '#071a35', cardBackground: 'rgba(6, 12, 25, .84)', cardText: '#f8fbff', cardBorder: 'rgba(142, 197, 255, .72)', cardShadow: '0 14px 38px rgba(0, 0, 0, .44)', fontFamily: 'system-ui, -apple-system, "PingFang SC", sans-serif', radius: '0px' },
  { id: 'gold', name: '金色', summary: '衬线斜体与金色电影字幕', graphicVariant: 'serif', accent: '#ffe7a3', accentInk: '#221606', cardBackground: 'rgba(24, 13, 5, .82)', cardText: '#ffe7a3', cardBorder: 'rgba(255, 231, 163, .62)', cardShadow: '0 16px 42px rgba(0, 0, 0, .46)', fontFamily: 'Georgia, "Songti SC", serif', radius: '0px' }
]

export function isEditingFrameId(value: unknown): value is EditingFrameId {
  return typeof value === 'string' && BUILTIN_EDITING_FRAMES.some((frame) => frame.id === value)
}

export function getEditingFrame(id: unknown): EditingFrame {
  return BUILTIN_EDITING_FRAMES.find((frame) => frame.id === id) ?? BUILTIN_EDITING_FRAMES[0]!
}

export function getEditingFrameStyle(id: unknown): Record<string, string> {
  const frame = getEditingFrame(id)
  return {
    '--editing-frame-accent': frame.accent,
    '--editing-frame-accent-ink': frame.accentInk,
    '--editing-frame-card-background': frame.cardBackground,
    '--editing-frame-card-text': frame.cardText,
    '--editing-frame-card-border': frame.cardBorder,
    '--editing-frame-card-shadow': frame.cardShadow,
    '--editing-frame-font-family': frame.fontFamily,
    '--editing-frame-radius': frame.radius
  }
}
