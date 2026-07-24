import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  appendAsrDiagnosticLog,
  readRecentAsrDiagnosticLogs,
  redactAsrErrorDetails
} from '../../src/core/ai/asr-diagnostics'

describe('asr diagnostics', () => {
  let tempDirectory: string

  beforeEach(async () => {
    tempDirectory = await mkdtemp(join(tmpdir(), 'aivplayer-asr-diagnostics-'))
  })

  afterEach(async () => {
    await rm(tempDirectory, { recursive: true, force: true })
  })

  it('redacts bearer tokens and API keys from error details', () => {
    expect(
      redactAsrErrorDetails({
        code: 'http-error',
        responseBody: 'Bearer secret-token sk-1234567890abcdef'
      })
    ).toEqual({
      code: 'http-error',
      responseBody: 'Bearer [REDACTED] [REDACTED_API_KEY]'
    })
  })

  it('writes structured daily JSONL diagnostics', async () => {
    await appendAsrDiagnosticLog(tempDirectory, 'translation-finished', {
      success: false,
      responseBody: 'sk-1234567890abcdef'
    })

    const entries = await readFile(join(tempDirectory, `asr-${new Date().toISOString().slice(0, 10)}.jsonl`), 'utf8')
    const entry = JSON.parse(entries.trim()) as { event: string; success: boolean; responseBody: string }

    expect(entry).toMatchObject({
      event: 'translation-finished',
      success: false,
      responseBody: '[REDACTED_API_KEY]'
    })
  })

  it('loads valid recent entries across JSONL files and ignores broken lines', async () => {
    await writeFile(
      join(tempDirectory, 'batch-1.jsonl'),
      [
        JSON.stringify({ timestamp: '2026-07-16T10:00:00.000Z', event: 'old-entry' }),
        'incomplete-json',
        JSON.stringify({ timestamp: '2026-07-16T10:02:00.000Z', event: 'new-entry' })
      ].join('\n'),
      'utf8'
    )

    const entries = await readRecentAsrDiagnosticLogs([tempDirectory], 1)

    expect(entries).toEqual([{ timestamp: '2026-07-16T10:02:00.000Z', event: 'new-entry' }])
  })
})
