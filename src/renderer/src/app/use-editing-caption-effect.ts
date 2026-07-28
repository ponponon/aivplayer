import { useEffect } from 'react'
import type { AppDerived } from './use-app-derived'
import type { AppModel } from './app-types'
import { createEditingCaptionPathCandidates, loadEditingCaptions } from './editing-caption-loader'
import { saveEditingProject } from './editing-project-storage'

export function useEditingCaptionEffect(model: AppModel, derived: AppDerived): void {
  const sourceKey = model.editingProject?.sources.map((source) => `${source.id}:${source.path}`).join('|') ?? ''
  useEffect(() => {
    const project = model.editingProject
    if (!model.isEditingMode || !project || project.sources.length === 0) return
    let cancelled = false
    const sources = project.sources.flatMap((source, index) => [
      { path: index === 0 ? (derived.subtitleSrtPath ?? derived.subtitlePath) : null, pathCandidates: createEditingCaptionPathCandidates(source.path, index === 0 ? (derived.subtitleSrtPath ?? derived.subtitlePath) : null, 'source'), sourceId: source.id, kind: 'source' as const },
      { path: index === 0 ? (derived.translatedSubtitleSrtPath ?? derived.translatedSubtitlePath) : null, pathCandidates: createEditingCaptionPathCandidates(source.path, index === 0 ? (derived.translatedSubtitleSrtPath ?? derived.translatedSubtitlePath) : null, 'translation'), sourceId: source.id, kind: 'translation' as const }
    ])
    void loadEditingCaptions(sources).then((captions) => {
      if (cancelled || captions.length === 0) return
      model.setEditingProject((current) => {
        if (!current || current.id !== project.id) return current
        const existingIds = new Set(current.captions.map((caption) => caption.id))
        const additions = captions.filter((caption) => !existingIds.has(caption.id))
        if (additions.length === 0) return current
        const next = { ...current, captions: [...current.captions, ...additions].sort((left, right) => left.startSeconds - right.startSeconds || left.kind.localeCompare(right.kind)), updatedAt: Date.now() }
        saveEditingProject(next)
        return next
      })
    })
    return () => { cancelled = true }
  }, [model.isEditingMode, model.editingProject?.id, sourceKey, derived.subtitlePath, derived.subtitleSrtPath, derived.translatedSubtitlePath, derived.translatedSubtitleSrtPath])
}
