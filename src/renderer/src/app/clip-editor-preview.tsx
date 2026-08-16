import { Pause, Play } from 'lucide-react'
import { useEffect, useRef, useState, type ReactElement } from 'react'
import type { LocaleCopy } from '../../../shared/i18n'
import { formatClipTime, type ClipSelection } from './clip-editor'
import { isMediaPlaying, syncBooleanPlayingState } from './playback-state'

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
  const isCurrentPreviewVideo = (video: HTMLVideoElement): boolean => video === videoRef.current

  useEffect(() => {
    setIsPlaying(false)
  }, [mediaUrl])

  useEffect(() => {
    const video = videoRef.current
    if (!video) return
    if (video.currentTime < selection.startSeconds || video.currentTime > selection.endSeconds) {
      if (isMediaPlaying(video)) video.pause()
      syncBooleanPlayingState(setIsPlaying, video, videoRef.current)
      video.currentTime = selection.startSeconds
      setPreviewTimeSeconds(selection.startSeconds)
    }
  }, [selection.startSeconds, selection.endSeconds])

  const togglePreview = (): void => {
    const video = videoRef.current
    if (!video || !canPreview) return
    if (isMediaPlaying(video)) {
      video.pause()
      syncBooleanPlayingState(setIsPlaying, video, videoRef.current)
      return
    }
    if (video.currentTime < selection.startSeconds || video.currentTime >= selection.endSeconds) {
      video.currentTime = selection.startSeconds
      setPreviewTimeSeconds(selection.startSeconds)
    }
    void video.play().then(() => {
      if (isCurrentPreviewVideo(video)) syncBooleanPlayingState(setIsPlaying, video, videoRef.current)
    }).catch(() => {
      if (isCurrentPreviewVideo(video)) syncBooleanPlayingState(setIsPlaying, video, videoRef.current)
    })
  }

  return (
    <section className="clip-editor-preview-panel" aria-label={copy.clipExportDialog.preview}>
      <div className="clip-editor-preview-frame media-preview-frame">
        <video
          key={mediaUrl || 'empty-preview-media'}
          ref={videoRef}
          className="clip-editor-preview-video media-preview-content"
          src={mediaUrl}
           preload="metadata"
           onLoadedMetadata={(event) => {
             if (!isCurrentPreviewVideo(event.currentTarget)) return
             const duration = event.currentTarget.duration
            if (Number.isFinite(duration) && duration > 0) onDurationDetected(duration)
            event.currentTarget.currentTime = selection.startSeconds
            setPreviewTimeSeconds(selection.startSeconds)
          }}
          onPlay={(event) => { if (isCurrentPreviewVideo(event.currentTarget)) syncBooleanPlayingState(setIsPlaying, event.currentTarget, videoRef.current) }}
          onPause={(event) => { if (isCurrentPreviewVideo(event.currentTarget)) syncBooleanPlayingState(setIsPlaying, event.currentTarget, videoRef.current) }}
          onTimeUpdate={(event) => {
            const video = event.currentTarget
            if (!isCurrentPreviewVideo(video)) return
            syncBooleanPlayingState(setIsPlaying, video, videoRef.current)
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
