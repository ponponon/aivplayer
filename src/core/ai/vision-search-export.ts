import { open } from 'node:fs/promises'
import type { VisionSearchResult, VisionSearchResultsExportFormat } from '../../shared/vision-types'

export const VISION_SEARCH_EXPORT_CHUNK_SIZE = 256

export type VisionSearchExportWriteProgress = {
  writtenCount: number
  totalCount: number
}

function csvValue(value: unknown): string {
  const raw = value === undefined || value === null ? '' : String(value)
  const text = /^[=+\-@]/.test(raw) ? `'${raw}` : raw
  return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text
}

function renderJson(results: readonly VisionSearchResult[]): string {
  return `${JSON.stringify({ exportVersion: 1, results }, null, 2)}\n`
}

const CSV_HEADER = [
  'index', 'evidence_id', 'evidence_type', 'source_id', 'frame_id', 'video_path', 'file_name',
  'timestamp_seconds', 'start_seconds', 'end_seconds', 'score', 'confidence', 'matched_text',
  'match_source', 'box_xmin', 'box_ymin', 'box_xmax', 'box_ymax', 'source_fingerprint', 'model_id', 'model_variant'
].join(',')

function renderCsvRow(result: VisionSearchResult, index: number): string {
  const row = [
    index + 1,
    result.evidenceId ?? '',
    result.evidenceType ?? '',
    result.sourceId ?? '',
    result.frameId ?? '',
    result.videoPath,
    result.fileName,
    result.timestampSeconds,
    result.startSeconds ?? '',
    result.endSeconds ?? '',
    result.score,
    result.confidence ?? '',
    result.matchedText ?? '',
    result.matchSource ?? '',
    result.box?.xmin ?? '',
    result.box?.ymin ?? '',
    result.box?.xmax ?? '',
    result.box?.ymax ?? '',
    result.sourceFingerprint ?? '',
    result.modelId,
    result.modelVariant
  ]
  return row.map(csvValue).join(',')
}

function renderCsv(results: readonly VisionSearchResult[]): string {
  return `${[CSV_HEADER, ...results.map(renderCsvRow)].join('\n')}\n`
}

function abortIfRequested(signal?: AbortSignal): void {
  if (!signal?.aborted) return
  const error = new Error('视觉搜索导出已取消')
  error.name = 'AbortError'
  throw error
}

function waitForNextTurn(): Promise<void> {
  return new Promise((resolve) => setImmediate(resolve))
}

export function isVisionSearchExportAbortError(error: unknown): boolean {
  return error instanceof Error && error.name === 'AbortError'
}

export function renderVisionSearchResultsExportPreamble(format: VisionSearchResultsExportFormat): string {
  return format === 'csv' ? `${CSV_HEADER}\n` : '{\n  "exportVersion": 1,\n  "results": [\n'
}

export function renderVisionSearchResultsExportChunk(
  results: readonly VisionSearchResult[],
  format: VisionSearchResultsExportFormat,
  startIndex: number
): string {
  if (format === 'csv') return `${results.map((result, index) => renderCsvRow(result, startIndex + index)).join('\n')}${results.length > 0 ? '\n' : ''}`
  return results.map((result, index) => `${startIndex + index === 0 ? '' : ',\n'}    ${JSON.stringify(result)}`).join('')
}

export function renderVisionSearchResultsExportEpilogue(format: VisionSearchResultsExportFormat): string {
  return format === 'csv' ? '' : '\n  ]\n}\n'
}

export async function writeVisionSearchResultsExportInChunks(
  outputPath: string,
  results: readonly VisionSearchResult[],
  format: VisionSearchResultsExportFormat,
  signal?: AbortSignal,
  onProgress?: (progress: VisionSearchExportWriteProgress) => void,
  chunkSize = VISION_SEARCH_EXPORT_CHUNK_SIZE
): Promise<void> {
  const safeChunkSize = Math.max(1, Math.floor(chunkSize))
  const handle = await open(outputPath, 'w')
  try {
    abortIfRequested(signal)
    await handle.write(renderVisionSearchResultsExportPreamble(format), undefined, 'utf8')
    onProgress?.({ writtenCount: 0, totalCount: results.length })
    for (let startIndex = 0; startIndex < results.length; startIndex += safeChunkSize) {
      abortIfRequested(signal)
      const chunk = results.slice(startIndex, startIndex + safeChunkSize)
      await handle.write(renderVisionSearchResultsExportChunk(chunk, format, startIndex), undefined, 'utf8')
      onProgress?.({ writtenCount: startIndex + chunk.length, totalCount: results.length })
      await waitForNextTurn()
    }
    abortIfRequested(signal)
    await handle.write(renderVisionSearchResultsExportEpilogue(format), undefined, 'utf8')
  } finally {
    await handle.close()
  }
}

export function renderVisionSearchResultsExport(results: readonly VisionSearchResult[], format: VisionSearchResultsExportFormat): string {
  return format === 'csv' ? renderCsv(results) : renderJson(results)
}
