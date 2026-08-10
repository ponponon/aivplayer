import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { buildEditingSubtitleExportDefaultFileName, normalizeEditingSubtitleExportText, writeEditingSubtitleFile } from '../../src/core/editing/subtitle-file-export'

describe('editing subtitle file export', () => {
  it('normalizes line endings and rejects empty text', () => {
    expect(normalizeEditingSubtitleExportText('\r\n  1\r\n00:00:00,000 --> 00:00:01,000\r\n字幕\r\n')).toBe('1\n00:00:00,000 --> 00:00:01,000\n字幕\n')
    expect(normalizeEditingSubtitleExportText('  \r\n')).toBeNull()
    expect(normalizeEditingSubtitleExportText(42)).toBeNull()
  })

  it('builds stable source and translation file names', () => {
    expect(buildEditingSubtitleExportDefaultFileName('/media/海边: take.mp4', 'source')).toBe('海边- take-edited-source.srt')
    expect(buildEditingSubtitleExportDefaultFileName('/media/demo.mp4', 'translation')).toBe('demo-edited-translation.srt')
  })

  it('writes an atomically replaced SRT file and cleans temporary output', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'aivplayer-subtitle-export-'))
    try {
      const outputPath = join(directory, 'captions.srt')
      await writeEditingSubtitleFile(outputPath, '1\n00:00:00,000 --> 00:00:01,000\n第一句')
      expect(await readFile(outputPath, 'utf8')).toBe('1\n00:00:00,000 --> 00:00:01,000\n第一句\n')
      await expect(writeEditingSubtitleFile(join(directory, 'captions.txt'), '字幕')).rejects.toThrow('.srt')
      await expect(writeEditingSubtitleFile(join(directory, 'empty.srt'), '  ')).rejects.toThrow('没有可导出的字幕内容')
    } finally {
      await rm(directory, { recursive: true, force: true })
    }
  })
})
