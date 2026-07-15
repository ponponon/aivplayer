import { appendFile, mkdir } from 'node:fs/promises'
import { join } from 'node:path'
import type { AsrErrorDetails } from '../../shared/media-types.ts'

type AsrDiagnosticDetails = Record<string, unknown>

function redactText(value: string): string {
  return value
    .replace(/Bearer\s+[^\s"']+/gi, 'Bearer [REDACTED]')
    .replace(/\bsk-[A-Za-z0-9_-]{10,}\b/g, '[REDACTED_API_KEY]')
}

function redactValue(value: unknown): unknown {
  if (typeof value === 'string') {
    return redactText(value)
  }

  if (Array.isArray(value)) {
    return value.map(redactValue)
  }

  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([key, entry]) => [key, redactValue(entry)]))
  }

  return value
}

export function redactAsrErrorDetails(errorDetails?: AsrErrorDetails): AsrErrorDetails | undefined {
  if (!errorDetails) {
    return undefined
  }

  return redactValue(errorDetails) as AsrErrorDetails
}

export async function appendAsrDiagnosticLog(
  logDirectoryPath: string,
  event: string,
  details: AsrDiagnosticDetails = {}
): Promise<void> {
  try {
    await mkdir(logDirectoryPath, { recursive: true })
    const date = new Date().toISOString().slice(0, 10)
    const safeDetails = redactValue(details) as AsrDiagnosticDetails
    await appendFile(
      join(logDirectoryPath, `asr-${date}.jsonl`),
      `${JSON.stringify({
        timestamp: new Date().toISOString(),
        event,
        ...safeDetails
      })}\n`,
      'utf8'
    )
  } catch {
    // Diagnostic logging must never break subtitle generation or translation.
  }
}

export function getAsrLogDirectoryPath(userDataPath: string): string {
  return join(userDataPath, 'logs', 'asr')
}
