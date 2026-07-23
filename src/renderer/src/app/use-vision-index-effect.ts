import { useEffect } from 'react'
import type { AppModel } from './app-types'

const AUTO_INDEX_INTERVAL_MS = 60_000

export function useVisionIndexEffect(model: AppModel): void {
  const playlistPaths = model.state.playlist.map((file) => file.path)
  const libraryDirectories = model.appSettings.vision.libraryDirectories
  const pathSignature = `${playlistPaths.join('\0')}\u0001${libraryDirectories.join('\0')}`

  useEffect(() => {
    if (playlistPaths.length === 0 && libraryDirectories.length === 0) return undefined

    let active = true
    let isRefreshing = false
    const enqueue = async (): Promise<void> => {
      if (!active || isRefreshing) return
      isRefreshing = true
      const mediaPaths = new Set(playlistPaths)
      try {
        for (const directoryPath of libraryDirectories) {
          if (!active) return
          try {
            const result = await window.aiv.scanVisionDirectory({ directoryPath, recursive: true })
            if (result.status === 'completed') {
              for (const filePath of result.files) mediaPaths.add(filePath)
            }
          } catch {
            // A missing or temporarily unavailable library directory should not
            // block the remaining directories or playlist indexing.
          }
        }
        if (active && mediaPaths.size > 0) await window.aiv.enqueueVisionIndex({ mediaPaths: [...mediaPaths], intervalSeconds: 3 })
      } finally {
        isRefreshing = false
      }
    }
    const initialTimer = window.setTimeout(() => { void enqueue() }, 800)
    const refreshTimer = window.setInterval(() => { void enqueue() }, AUTO_INDEX_INTERVAL_MS)
    return () => {
      active = false
      window.clearTimeout(initialTimer)
      window.clearInterval(refreshTimer)
    }
  }, [pathSignature])
}
