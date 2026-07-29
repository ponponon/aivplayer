import { useEffect, useState } from 'react'
import type { EditingProject } from '../../../shared/editing-types'
import type { EditingFilmstripFrame } from '../../../core/editing/filmstrip-operations'

export type { EditingFilmstripFrame } from '../../../core/editing/filmstrip-operations'
type FilmstripSourceFile = { path: string }

function getFilmstripTimestamps(durationSeconds: number): number[] {
  const count = Math.min(12, Math.max(4, Math.ceil(durationSeconds / 6)))
  return Array.from({ length: count }, (_, index) => Math.min(Math.max(0, durationSeconds - 0.05), ((index + 0.5) / count) * durationSeconds))
}

export function useEditingFilmstrips(project: EditingProject | null, sourceFiles: Record<string, FilmstripSourceFile>): Record<string, EditingFilmstripFrame[]> {
  const [filmstrips, setFilmstrips] = useState<Record<string, EditingFilmstripFrame[]>>({})
  const sourceSignature = project?.sources.map((source) => `${source.id}:${source.path}:${source.durationSeconds}`).join('|') ?? ''
  const fileSignature = project?.sources.map((source) => `${source.id}:${sourceFiles[source.id]?.path ?? ''}`).join('|') ?? ''

  useEffect(() => {
    setFilmstrips({})
    if (!project) return
    let cancelled = false
    for (const source of project.sources) {
      const mediaPath = sourceFiles[source.id]?.path
      if (!mediaPath || source.durationSeconds <= 0) continue
      void window.aiv.extractMediaFilmstrip({ mediaPath, timestampsSeconds: getFilmstripTimestamps(source.durationSeconds), width: 320, quality: 5 }).then((result) => {
        if (cancelled) return
        const frames = result.frames.map((frame) => ({ sourceSeconds: frame.sourceSeconds, url: frame.dataUrl }))
        setFilmstrips((current) => ({ ...current, [source.id]: frames }))
      }).catch(() => {})
    }
    return () => { cancelled = true }
  }, [fileSignature, project?.id, sourceSignature])

  return filmstrips
}
