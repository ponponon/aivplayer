import type { VisionClipCollection, VisionClipCollectionExportFormat, VisionClipSelection } from '../../shared/vision-types'

const DEFAULT_EDL_FRAME_RATE = 30

function csvValue(value: unknown): string {
  const text = value === undefined || value === null ? '' : String(value)
  return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text
}

function secondsToEdlTimecode(seconds: number, frameRate = DEFAULT_EDL_FRAME_RATE): string {
  const totalFrames = Math.max(0, Math.round(seconds * frameRate))
  const framesPerSecond = Math.max(1, Math.round(frameRate))
  const totalSeconds = Math.floor(totalFrames / framesPerSecond)
  const frames = totalFrames % framesPerSecond
  const hours = Math.floor(totalSeconds / 3600)
  const minutes = Math.floor((totalSeconds % 3600) / 60)
  const wholeSeconds = totalSeconds % 60
  return [hours, minutes, wholeSeconds].map((value) => String(value).padStart(2, '0')).join(':') + `:${String(frames).padStart(2, '0')}`
}

function renderJson(collection: VisionClipCollection): string {
  return `${JSON.stringify({ exportVersion: 1, collection }, null, 2)}\n`
}

function renderBatchJson(collections: readonly VisionClipCollection[]): string {
  return `${JSON.stringify({ exportVersion: 2, collections }, null, 2)}\n`
}

function renderCsv(collection: VisionClipCollection): string {
  const header = ['index', 'source_id', 'video_path', 'file_name', 'start_seconds', 'end_seconds', 'duration_seconds', 'fingerprint', 'text', 'evidence_types']
  const rows = collection.selections.map((selection, index) => [
    index + 1,
    selection.sourceId,
    selection.videoPath,
    selection.fileName,
    selection.startSeconds,
    selection.endSeconds,
    Number((selection.endSeconds - selection.startSeconds).toFixed(3)),
    selection.fingerprint,
    selection.text ?? '',
    selection.evidenceTypes.join('|')
  ])
  return `${[header, ...rows].map((row) => row.map(csvValue).join(',')).join('\n')}\n`
}

function renderEdlSelection(selection: VisionClipSelection, index: number, timelineStartSeconds: number, frameRate: number): string[] {
  const duration = Math.max(0, selection.endSeconds - selection.startSeconds)
  const timelineEndSeconds = timelineStartSeconds + duration
  const event = `${String(index).padStart(3, '0')}  AX       V     C        ${secondsToEdlTimecode(selection.startSeconds, frameRate)} ${secondsToEdlTimecode(selection.endSeconds, frameRate)} ${secondsToEdlTimecode(timelineStartSeconds, frameRate)} ${secondsToEdlTimecode(timelineEndSeconds, frameRate)}`
  const notes = [`* FROM CLIP NAME: ${selection.fileName}`, `* SOURCE FILE: ${selection.videoPath}`]
  if (selection.text) notes.push(`* NOTE: ${selection.text.replace(/[\r\n]+/g, ' ')}`)
  return [event, ...notes]
}

function renderEdl(collection: VisionClipCollection, frameRate = DEFAULT_EDL_FRAME_RATE): string {
  const lines = [`TITLE: ${collection.title}`, 'FCM: NON-DROP FRAME']
  let timelineStartSeconds = 0
  collection.selections.forEach((selection, index) => {
    lines.push(...renderEdlSelection(selection, index + 1, timelineStartSeconds, frameRate))
    timelineStartSeconds += Math.max(0, selection.endSeconds - selection.startSeconds)
  })
  return `${lines.join('\n')}\n`
}

export function renderVisionClipCollectionExport(collection: VisionClipCollection, format: VisionClipCollectionExportFormat, frameRate = DEFAULT_EDL_FRAME_RATE): string {
  if (format === 'csv') return renderCsv(collection)
  if (format === 'edl') return renderEdl(collection, frameRate)
  return renderJson(collection)
}

export function renderVisionClipCollectionsExport(collections: readonly VisionClipCollection[]): string {
  return renderBatchJson(collections)
}
