import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { buildEditingSubtitleExportDefaultFileName, normalizeEditingSubtitleExportText, writeEditingSubtitleFile } from '../../src/core/editing/subtitle-file-export'
import { serializeEditingCaptionsToVtt } from '../../src/core/editing/caption-serialization'

describe('editing subtitle file export', () => {
  it('normalizes line endings and rejects empty text', () => {
    expect(normalizeEditingSubtitleExportText('\r\n  1\r\n00:00:00,000 --> 00:00:01,000\r\n字幕\r\n')).toBe('1\n00:00:00,000 --> 00:00:01,000\n字幕\n')
    expect(normalizeEditingSubtitleExportText('  \r\n')).toBeNull()
    expect(normalizeEditingSubtitleExportText(42)).toBeNull()
  })

  it('builds stable source and translation file names', () => {
    expect(buildEditingSubtitleExportDefaultFileName('/media/海边: take.mp4', 'source')).toBe('海边- take-edited-source.srt')
    expect(buildEditingSubtitleExportDefaultFileName('/media/demo.mp4', 'translation')).toBe('demo-edited-translation.srt')
    expect(buildEditingSubtitleExportDefaultFileName('/media/demo.mp4', 'source', 'vtt')).toBe('demo-edited-source.vtt')
  })

  it('serializes escaped VTT text with stable timestamps', () => {
    expect(serializeEditingCaptionsToVtt([{ id: 'source-1', kind: 'source', startSeconds: 1.25, durationSeconds: 2, text: '<第一句>' }])).toBe('WEBVTT\n\n00:00:01.250 --> 00:00:03.250\n&lt;第一句&gt;\n')
  })

  it('writes an atomically replaced subtitle file and cleans temporary output', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'aivplayer-subtitle-export-'))
    try {
      const outputPath = join(directory, 'captions.srt')
      await writeEditingSubtitleFile(outputPath, '1\n00:00:00,000 --> 00:00:01,000\n第一句')
      expect(await readFile(outputPath, 'utf8')).toBe('1\n00:00:00,000 --> 00:00:01,000\n第一句\n')
      await expect(writeEditingSubtitleFile(join(directory, 'captions.txt'), '字幕')).rejects.toThrow('.srt')
      await writeEditingSubtitleFile(join(directory, 'captions.vtt'), 'WEBVTT\n\n字幕', 'vtt')
      expect(await readFile(join(directory, 'captions.vtt'), 'utf8')).toBe('WEBVTT\n\n字幕\n')
      await expect(writeEditingSubtitleFile(join(directory, 'empty.srt'), '  ')).rejects.toThrow('没有可导出的字幕内容')
    } finally {
      await rm(directory, { recursive: true, force: true })
    }
  })
})
