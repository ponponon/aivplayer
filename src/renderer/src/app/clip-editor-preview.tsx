import { Pause, Play } from 'lucide-react'
import { useEffect, useRef, useState, type ReactElement } from 'react'
import type { LocaleCopy } from '../../../shared/i18n'
import { formatClipTime, type ClipSelection } from './clip-editor'

type ClipEditorPreviewProps = {
  copy: LocaleCopy
  mediaUrl: string
  selection: ClipSelection
  canPreview: boolean
  onDurationDetected: (durationSeconds: number) => void
}

export function ClipEditorPreview(props: ClipEditorPreviewProps): ReactElement {
  const { copy, mediaUrl, selection, canPreview, onDurationDetected } = props
  const [previewTimeSeconds, setPreviewTimeSeconds] = useState(selection.startSeconds)
  const [isPlaying, setIsPlaying] = useState(false)
  const videoRef = useRef<HTMLVideoElement | null>(null)

  useEffect(() => {
    const video = videoRef.current
    if (!video) return
    if (video.currentTime < selection.startSeconds || video.currentTime > selection.endSeconds) {
      if (!video.paused) video.pause()
      video.currentTime = selection.startSeconds
      setPreviewTimeSeconds(selection.startSeconds)
    }
  }, [selection.startSeconds, selection.endSeconds])

  const togglePreview = (): void => {
    const video = videoRef.current
    if (!video || !canPreview) return
    if (!video.paused) {
      video.pause()
      return
    }
    if (video.currentTime < selection.startSeconds || video.currentTime >= selection.endSeconds) {
      video.currentTime = selection.startSeconds
      setPreviewTimeSeconds(selection.startSeconds)
    }
    void video.play().catch(() => setIsPlaying(false))
  }

  return (
    <section className="clip-editor-preview-panel" aria-label={copy.clipExportDialog.preview}>
      <div className="clip-editor-preview-frame">
        <video
          ref={videoRef}
          className="clip-editor-preview-video"
          src={mediaUrl}
          preload="metadata"
          onLoadedMetadata={(event) => {
            const duration = event.currentTarget.duration
            if (Number.isFinite(duration) && duration > 0) onDurationDetected(duration)
            event.currentTarget.currentTime = selection.startSeconds
            setPreviewTimeSeconds(selection.startSeconds)
          }}
          onPlay={() => setIsPlaying(true)}
          onPause={() => setIsPlaying(false)}
          onTimeUpdate={(event) => {
            const video = event.currentTarget
            if (video.currentTime >= selection.endSeconds - 0.02) {
              video.pause()
              video.currentTime = selection.endSeconds
              setPreviewTimeSeconds(selection.endSeconds)
              return
            }
            setPreviewTimeSeconds(video.currentTime)
          }}
        />
      </div>
      <div className="clip-editor-preview-controls">
        <button className="settings-secondary-button clip-editor-preview-button" type="button" onClick={togglePreview} disabled={!canPreview}>
          {isPlaying ? <Pause size={14} /> : <Play size={14} />}
          {isPlaying ? copy.clipExportDialog.pausePreview : copy.clipExportDialog.preview}
        </button>
        <span className="clip-editor-preview-time">
          {formatClipTime(previewTimeSeconds)} / {formatClipTime(selection.endSeconds)}
        </span>
        <span className="clip-editor-preview-hint">{copy.clipExportDialog.previewHint}</span>
      </div>
    </section>
  )
}
