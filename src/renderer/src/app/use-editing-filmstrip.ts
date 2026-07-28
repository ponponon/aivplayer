import { useEffect, useState } from 'react'
import type { EditingProject } from '../../../shared/editing-types'

export type EditingFilmstripFrame = { sourceSeconds: number; url: string }

function waitForMetadata(video: HTMLVideoElement): Promise<void> {
  if (video.readyState >= 1) return Promise.resolve()
  return new Promise((resolve, reject) => {
    video.addEventListener('loadedmetadata', () => resolve(), { once: true })
    video.addEventListener('error', () => reject(new Error('Unable to load video metadata')), { once: true })
  })
}

function seekVideo(video: HTMLVideoElement, seconds: number): Promise<void> {
  if (Math.abs(video.currentTime - seconds) < 0.01) return Promise.resolve()
  return new Promise((resolve) => {
    video.addEventListener('seeked', () => resolve(), { once: true })
    video.currentTime = seconds
  })
}

async function captureFilmstrip(fileUrl: string, durationSeconds: number, cancelled: () => boolean): Promise<EditingFilmstripFrame[]> {
  const video = document.createElement('video')
  video.preload = 'auto'
  video.muted = true
  video.src = fileUrl
  const canvas = document.createElement('canvas')
  const context = canvas.getContext('2d')
  if (!context) return []
  await waitForMetadata(video)
  if (cancelled()) return []
  canvas.width = Math.min(320, video.videoWidth || 320)
  canvas.height = Math.max(1, Math.round((video.videoHeight || 180) * (canvas.width / (video.videoWidth || 320))))
  const count = Math.min(18, Math.max(4, Math.ceil(durationSeconds / 3)))
  const frames: EditingFilmstripFrame[] = []
  for (let index = 0; index < count; index += 1) {
    if (cancelled()) break
    const sourceSeconds = count === 1 ? 0 : Math.min(Math.max(0, durationSeconds - 0.05), (index / (count - 1)) * Math.max(0, durationSeconds - 0.05))
    await seekVideo(video, sourceSeconds)
    if (cancelled()) break
    context.drawImage(video, 0, 0, canvas.width, canvas.height)
    frames.push({ sourceSeconds, url: canvas.toDataURL('image/jpeg', 0.72) })
  }
  video.removeAttribute('src')
  video.load()
  return frames
}

export function useEditingFilmstrip(project: EditingProject | null, fileUrl: string | null): EditingFilmstripFrame[] {
  const [frames, setFrames] = useState<EditingFilmstripFrame[]>([])
  const source = project?.sources[0]
  useEffect(() => {
    if (!project || !source || !fileUrl || source.durationSeconds <= 0) {
      setFrames([])
      return
    }
    let cancelled = false
    void captureFilmstrip(fileUrl, source.durationSeconds, () => cancelled).then((next) => {
      if (!cancelled) setFrames(next)
    }).catch(() => { if (!cancelled) setFrames([]) })
    return () => { cancelled = true }
  }, [fileUrl, project?.id, source?.durationSeconds, source?.path])
  return frames
}
