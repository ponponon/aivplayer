export type SubtitlePresetId = 'clean' | 'yellow' | 'mint' | 'navy' | 'serif-gold'
export type SubtitleEmphasisMode = 'none' | 'keywords' | 'words'
export type SubtitleRenderSettings = {
  presetId?: SubtitlePresetId
  emphasisMode?: SubtitleEmphasisMode
  keywords?: string
  fontSizePx?: number
}

export type SubtitlePreset = {
  id: SubtitlePresetId
  fontFamily: 'system' | 'serif' | 'mono'
  fontWeight: 600 | 700 | 800
  italic: boolean
  textColor: string
  backgroundColor: string
  emphasisBackgroundColor: string
  emphasisTextColor: string
  textShadow: string
  borderRadiusPx: number
  emphasisDecoration: 'none' | 'underline'
  assPrimaryColor: string
  assOutlineColor: string
  assBackColor: string
  assBorderStyle: 1 | 3
  assOutline: number
  assShadow: number
  assEmphasisColor: string
  assEmphasisUnderline: boolean
}

export const SUBTITLE_PRESET_IDS: readonly SubtitlePresetId[] = ['clean', 'yellow', 'mint', 'navy', 'serif-gold']

export const SUBTITLE_PRESETS: readonly SubtitlePreset[] = [
  { id: 'clean', fontFamily: 'system', fontWeight: 700, italic: false, textColor: '#ffffff', backgroundColor: 'transparent', emphasisBackgroundColor: 'rgba(255, 210, 72, 0.92)', emphasisTextColor: '#17130a', textShadow: '0 2px 8px rgba(0, 0, 0, 0.82)', borderRadiusPx: 4, emphasisDecoration: 'none', assPrimaryColor: '&H00FFFFFF', assOutlineColor: '&H00101010', assBackColor: '&H99000000', assBorderStyle: 1, assOutline: 2, assShadow: 1, assEmphasisColor: '&H0048D2FF', assEmphasisUnderline: false },
  { id: 'yellow', fontFamily: 'system', fontWeight: 800, italic: false, textColor: '#fffdf1', backgroundColor: 'rgba(56, 43, 4, 0.72)', emphasisBackgroundColor: '#f6d34d', emphasisTextColor: '#241d04', textShadow: '0 2px 8px rgba(0, 0, 0, 0.72)', borderRadiusPx: 6, emphasisDecoration: 'none', assPrimaryColor: '&H00F1FDFF', assOutlineColor: '&H00392A05', assBackColor: '&HB8042B38', assBorderStyle: 3, assOutline: 5, assShadow: 0, assEmphasisColor: '&H001F1A05', assEmphasisUnderline: false },
  { id: 'mint', fontFamily: 'system', fontWeight: 800, italic: false, textColor: '#f1fff9', backgroundColor: 'rgba(5, 53, 43, 0.72)', emphasisBackgroundColor: '#75e0b5', emphasisTextColor: '#06271c', textShadow: '0 2px 8px rgba(0, 0, 0, 0.72)', borderRadiusPx: 6, emphasisDecoration: 'none', assPrimaryColor: '&H00F9FFF1', assOutlineColor: '&H002B3505', assBackColor: '&HB8053505', assBorderStyle: 3, assOutline: 5, assShadow: 0, assEmphasisColor: '&H001C2706', assEmphasisUnderline: false },
  { id: 'navy', fontFamily: 'system', fontWeight: 700, italic: false, textColor: '#f8fbff', backgroundColor: 'rgba(12, 27, 56, 0.88)', emphasisBackgroundColor: '#8ec5ff', emphasisTextColor: '#071a35', textShadow: '0 2px 8px rgba(0, 0, 0, 0.58)', borderRadiusPx: 6, emphasisDecoration: 'none', assPrimaryColor: '&H00FFFBF8', assOutlineColor: '&H00381B0C', assBackColor: '&HEB381B0C', assBorderStyle: 3, assOutline: 4, assShadow: 0, assEmphasisColor: '&H00351A07', assEmphasisUnderline: false },
  { id: 'serif-gold', fontFamily: 'serif', fontWeight: 700, italic: true, textColor: '#ffe7a3', backgroundColor: 'transparent', emphasisBackgroundColor: 'transparent', emphasisTextColor: '#ffffff', textShadow: '0 2px 8px rgba(0, 0, 0, 0.9)', borderRadiusPx: 0, emphasisDecoration: 'underline', assPrimaryColor: '&H00A3E7FF', assOutlineColor: '&H001B1004', assBackColor: '&H99000000', assBorderStyle: 1, assOutline: 2, assShadow: 1, assEmphasisColor: '&H00FFFFFF', assEmphasisUnderline: true }
]

export function isSubtitlePresetId(value: unknown): value is SubtitlePresetId {
  return typeof value === 'string' && SUBTITLE_PRESET_IDS.includes(value as SubtitlePresetId)
}

export function isSubtitleEmphasisMode(value: unknown): value is SubtitleEmphasisMode {
  return value === 'none' || value === 'keywords' || value === 'words'
}

export function getSubtitlePreset(id: SubtitlePresetId | string | null | undefined): SubtitlePreset {
  return SUBTITLE_PRESETS.find((preset) => preset.id === id) ?? SUBTITLE_PRESETS[0]!
}

export function normalizeSubtitleKeywords(value: unknown): string {
  if (typeof value !== 'string') return ''
  const keywords: string[] = []
  for (const keyword of value.split(/[\n,，、]+/)) {
    const normalized = keyword.trim()
    if (!normalized || keywords.includes(normalized)) continue
    keywords.push(normalized)
    if (keywords.length >= 24) break
  }
  return keywords.join('\n').slice(0, 512)
}

export type SubtitleTextPart = { text: string; emphasized: boolean }

export function splitSubtitleTextByKeywords(text: string, keywordsText: string): SubtitleTextPart[] {
  const keywords = normalizeSubtitleKeywords(keywordsText).split('\n').filter(Boolean).sort((left, right) => right.length - left.length)
  if (keywords.length === 0) return [{ text, emphasized: false }]
  const pattern = new RegExp(`(${keywords.map((keyword) => keyword.replace(/[.*+?^${}()|[\\]\\\\]/g, '\\\\$&')).join('|')})`, 'giu')
  const parts: SubtitleTextPart[] = []
  let lastIndex = 0
  for (const match of text.matchAll(pattern)) {
    const index = match.index ?? 0
    if (index > lastIndex) parts.push({ text: text.slice(lastIndex, index), emphasized: false })
    parts.push({ text: match[0], emphasized: true })
    lastIndex = index + match[0].length
  }
  if (lastIndex < text.length) parts.push({ text: text.slice(lastIndex), emphasized: false })
  return parts.length > 0 ? parts : [{ text, emphasized: false }]
}
