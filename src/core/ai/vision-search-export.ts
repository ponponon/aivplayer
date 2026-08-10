import type { VisionSearchResult, VisionSearchResultsExportFormat } from '../../shared/vision-types'

function csvValue(value: unknown): string {
  const raw = value === undefined || value === null ? '' : String(value)
  const text = /^[=+\-@]/.test(raw) ? `'${raw}` : raw
  return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text
}

function renderJson(results: readonly VisionSearchResult[]): string {
  return `${JSON.stringify({ exportVersion: 1, results }, null, 2)}\n`
}

function renderCsv(results: readonly VisionSearchResult[]): string {
  const header = [
    'index', 'evidence_id', 'evidence_type', 'source_id', 'frame_id', 'video_path', 'file_name',
    'timestamp_seconds', 'start_seconds', 'end_seconds', 'score', 'confidence', 'matched_text',
    'match_source', 'box_xmin', 'box_ymin', 'box_xmax', 'box_ymax', 'source_fingerprint', 'model_id', 'model_variant'
  ]
  const rows = results.map((result, index) => [
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
  ])
  return `${[header, ...rows].map((row) => row.map(csvValue).join(',')).join('\n')}\n`
}

export function renderVisionSearchResultsExport(results: readonly VisionSearchResult[], format: VisionSearchResultsExportFormat): string {
  return format === 'csv' ? renderCsv(results) : renderJson(results)
}
