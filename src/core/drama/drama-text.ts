import type { DramaImportChapterInput } from '../../shared/drama-types'

const chapterPattern = /^(?:第\s*(\d+)\s*[章节回集篇]\s*(.*)|chapter\s+(\d+)\s*[:：.-]?\s*(.*))$/i
const volumePattern = /^(?:第\s*\d+\s*卷|卷\s*\d+|volume\s+\d+)(?:\s+.*)?$/i

export function parseDramaChapters(text: string): DramaImportChapterInput[] {
  const normalized = text.replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n').trim()
  if (!normalized) return []

  const lines = normalized.split('\n')
  const chapters: DramaImportChapterInput[] = []
  let current: { title: string; volume: string; lines: string[] } | null = null
  let currentVolume = ''

  const flush = (): void => {
    if (!current) return
    const content = current.lines.join('\n').trim()
    if (content) chapters.push({ chapterIndex: chapters.length + 1, volume: current.volume, title: current.title, content })
  }

  for (const rawLine of lines) {
    const line = rawLine.trim()
    if (!line) {
      if (current && current.lines.length > 0 && current.lines.at(-1) !== '') current.lines.push('')
      continue
    }

    if (volumePattern.test(line) && !chapterPattern.test(line)) {
      if (current && current.lines.some((value) => value.trim())) flush()
      currentVolume = line
      continue
    }

    const match = line.match(chapterPattern)
    if (match) {
      flush()
      current = { title: (match[2] ?? match[4] ?? '').trim() || `第${chapters.length + 1}章`, volume: currentVolume, lines: [] }
      continue
    }

    if (!current) current = { title: '正文', volume: currentVolume, lines: [] }
    current.lines.push(rawLine)
  }
  flush()

  if (chapters.length === 0) return [{ chapterIndex: 1, volume: '', title: '正文', content: normalized }]
  return chapters
}

export function formatDramaChapterText(chapters: DramaImportChapterInput[]): string {
  return chapters
    .map((chapter) => `${chapter.title}\n\n${chapter.content.trim()}`)
    .join('\n\n')
}
