import { appendFile, mkdir, readdir, readFile } from 'node:fs/promises'
import { join } from 'node:path'
import type { AsrDiagnosticLogEntry, AsrErrorDetails } from '../../shared/media-types.ts'

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

function isDiagnosticLogEntry(value: unknown): value is AsrDiagnosticLogEntry {
  if (!value || typeof value !== 'object') {
    return false
  }

  const entry = value as Record<string, unknown>
  return typeof entry.timestamp === 'string' && typeof entry.event === 'string'
}

export async function readRecentAsrDiagnosticLogs(
  logDirectoryPaths: string[],
  limit = 80
): Promise<AsrDiagnosticLogEntry[]> {
  const entries: AsrDiagnosticLogEntry[] = []

  for (const directoryPath of logDirectoryPaths) {
    let fileNames: string[]
    try {
      fileNames = (await readdir(directoryPath)).filter((fileName) => fileName.endsWith('.jsonl'))
    } catch {
      continue
    }

    for (const fileName of fileNames) {
      try {
        const content = await readFile(join(directoryPath, fileName), 'utf8')
        for (const line of content.split(/\r?\n/)) {
          if (!line.trim()) {
            continue
          }

          try {
            const parsed: unknown = JSON.parse(line)
            if (isDiagnosticLogEntry(parsed)) {
              entries.push(parsed)
            }
          } catch {
            // Ignore an incomplete JSONL line while another process is appending to it.
          }
        }
      } catch {
        // A rotated or deleted log file should not prevent other logs from loading.
      }
    }
  }

  const safeLimit = Math.min(200, Math.max(1, Math.floor(limit)))
  return entries
    .sort((left, right) => right.timestamp.localeCompare(left.timestamp))
    .slice(0, safeLimit)
}

export function getAsrLogDirectoryPath(userDataPath: string): string {
  return join(userDataPath, 'logs', 'asr')
}
