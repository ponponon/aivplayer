import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { findSubtitleSummaryCache, runSubtitleSummaryJob, type SubtitleSummaryProvider } from '../../src/main/ai/subtitle-summary'

describe('subtitle summary', () => {
  let tempDirectory: string

  beforeEach(async () => {
    tempDirectory = await mkdtemp(join(tmpdir(), 'aivplayer-subtitle-summary-'))
  })

  afterEach(async () => {
    await rm(tempDirectory, { recursive: true, force: true })
  })

  it('summarizes subtitle chunks in the target language and reuses the cache', async () => {
    const sourceSubtitlePath = join(tempDirectory, 'movie.vtt')
    const cacheDirectory = join(tempDirectory, 'cache')
    let callCount = 0
    const provider: SubtitleSummaryProvider = {
      id: 'openai-compatible',
      model: 'summary-model',
      complete: async ({ system, user }) => {
        callCount += 1
        if (system.includes('阶段性剧情笔记')) {
          return '```json\n{"title":"夜航","overview":"一名记者追查失踪案。","synopsis":"记者沿着线索追查，最终找到真相。","keyPoints":["发现线索","揭开真相"],"characters":[{"name":"林遥","role":"记者"}],"themes":["选择"],"ending":"案件真相被公开。"}\n```'
        }
        return `阶段笔记：${user.slice(0, 20)}`
      }
    }

    await writeFile(sourceSubtitlePath, ['WEBVTT', '', '00:00:00.000 --> 00:00:01.000', '记者发现一张旧照片。', '', '00:00:02.000 --> 00:00:03.000', '她决定追查照片背后的失踪案。'].join('\n'))

    const first = await runSubtitleSummaryJob({ sourceSubtitlePath, cacheDirectory, sourceLanguage: 'ja', targetLanguage: 'zh', provider })
    const second = await runSubtitleSummaryJob({ sourceSubtitlePath, cacheDirectory, sourceLanguage: 'ja', targetLanguage: 'zh', provider })

    expect(first.summary.title).toBe('夜航')
    expect(first.summaryStats).toMatchObject({ subtitleCueCount: 2, chunkCount: 1, cacheHit: false, inputCharacterCount: expect.any(Number) })
    expect(second.summary).toEqual(first.summary)
    expect(second.summaryStats.cacheHit).toBe(true)
    expect(callCount).toBe(2)
    await expect(findSubtitleSummaryCache({ sourceSubtitlePath, cacheDirectory, sourceLanguage: 'ja', targetLanguage: 'zh', provider: { id: 'openai-compatible', model: 'summary-model' } })).resolves.toEqual(first.summary)
  })
})
