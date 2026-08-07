import { useEffect, useState } from 'react'
import type { EditingProject } from '../../../shared/editing-types'
import type { MediaWaveformResult } from '../../../shared/media-types'
import type { EditingWaveformSource } from '../../../core/editing/waveform-operations'

type WaveformSourceFile = { path: string }

export function useEditingWaveforms(project: EditingProject | null, sourceFiles: Record<string, WaveformSourceFile>): Record<string, EditingWaveformSource> {
  const [waveforms, setWaveforms] = useState<Record<string, EditingWaveformSource>>({})
  const sourceSignature = project?.sources.map((source) => `${source.id}:${source.path}:${source.durationSeconds}`).join('|') ?? ''
  const fileSignature = project?.sources.map((source) => `${source.id}:${sourceFiles[source.id]?.path ?? ''}`).join('|') ?? ''

  useEffect(() => {
    setWaveforms({})
    if (!project) return
    let cancelled = false
    for (const source of project.sources) {
      const mediaPath = sourceFiles[source.id]?.path
      if (!mediaPath || source.durationSeconds <= 0) continue
      void window.aiv.extractMediaWaveform({ mediaPath, width: 1200, height: 64 }).then((result: MediaWaveformResult) => {
        if (cancelled || !result.success || !result.dataUrl) return
        setWaveforms((current) => ({ ...current, [source.id]: { url: result.dataUrl!, durationSeconds: source.durationSeconds } }))
      }).catch(() => {})
    }
    return () => { cancelled = true }
  }, [fileSignature, project?.id, sourceSignature])

  return waveforms
}
