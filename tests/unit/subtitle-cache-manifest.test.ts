import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { getSubtitleCacheManifestPath, recordSubtitleCacheManifest } from '../../src/main/ai/subtitle-cache-manifest'

describe('subtitle cache manifest', () => {
  let tempDirectory: string

  beforeEach(async () => {
    tempDirectory = await mkdtemp(join(tmpdir(), 'aivplayer-subtitle-manifest-'))
  })

  afterEach(async () => {
    await rm(tempDirectory, { recursive: true, force: true })
  })

  it('groups ASR, translation, and summary artifacts without storing sensitive values', async () => {
    const mediaPath = join(tempDirectory, 'movie.mp4')
    const cacheDirectory = join(tempDirectory, 'cache')
    await writeFile(mediaPath, 'video fixture')

    await Promise.all([
      recordSubtitleCacheManifest({ cacheDirectory, mediaPath, artifact: { kind: 'asr', modelId: 'whisper-large', subtitlePath: '/cache/movie-raw.vtt', subtitleSrtPath: '/cache/movie-raw.srt' } }),
      recordSubtitleCacheManifest({ cacheDirectory, mediaPath, artifact: { kind: 'translation', sourceSubtitlePath: '/cache/movie-raw.vtt', sourceLanguage: 'en', targetLanguage: 'zh', model: 'translation-model', glossary: 'secret=敏感词', subtitlePath: '/cache/movie-translated.vtt', subtitleSrtPath: '/cache/movie-translated.srt' } }),
      recordSubtitleCacheManifest({ cacheDirectory, mediaPath, artifact: { kind: 'summary', sourceSubtitlePath: '/cache/movie-translated.vtt', sourceLanguage: 'zh', sourceType: 'translated', targetLanguage: 'zh', mode: 'quick', model: 'summary-model', summaryPath: '/cache/movie-summary.json' } })
    ])

    const manifestPath = await getSubtitleCacheManifestPath(cacheDirectory, mediaPath)
    const manifest = JSON.parse(await readFile(manifestPath, 'utf8')) as { schemaVersion: number; asr: unknown[]; translations: Array<{ glossaryHash?: string; glossary?: string }>; summaries: unknown[] }
    expect(manifest.schemaVersion).toBe(1)
    expect(manifest.asr).toHaveLength(1)
    expect(manifest.translations).toHaveLength(1)
    expect(manifest.summaries).toHaveLength(1)
    expect(manifest.translations[0].glossary).toBeUndefined()
    expect(manifest.translations[0].glossaryHash).toMatch(/^[a-f0-9]{16}$/)
  })
})
