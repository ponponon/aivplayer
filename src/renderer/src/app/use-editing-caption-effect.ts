import { useEffect } from 'react'
import type { AppDerived } from './use-app-derived'
import type { AppModel } from './app-types'
import { createEditingCaptionPathCandidates, loadEditingCaptions } from './editing-caption-loader'
import { saveEditingProject } from './editing-project-storage'
import { mergeEditingScriptSegments } from '../../../core/editing/script-operations'

export function useEditingCaptionEffect(model: AppModel, derived: AppDerived): void {
  const sourceKey = model.editingProject?.sources.map((source) => `${source.id}:${source.path}`).join('|') ?? ''
  const captionTimingKey = model.editingProject?.captions.map((caption) => `${caption.id}:${caption.words?.length ?? 0}`).join('|') ?? ''
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
        const scriptSegments = mergeEditingScriptSegments(current.scriptSegments, captions)
        const deletedSegments = scriptSegments.filter((segment) => segment.deleted)
        const isDeletedCaption = (caption: typeof captions[number]): boolean => {
          if (caption.kind === 'source') return deletedSegments.some((segment) => segment.id === caption.id)
          if (!caption.sourceId || caption.sourceStartSeconds === undefined || caption.sourceEndSeconds === undefined) return false
          return deletedSegments.some((segment) => {
            if (segment.sourceId !== caption.sourceId) return false
            return Math.min(segment.sourceEndSeconds, caption.sourceEndSeconds!) - Math.max(segment.sourceStartSeconds, caption.sourceStartSeconds!) > 0.05
          })
        }
        const existingIds = new Set(current.captions.map((caption) => caption.id))
        const additions = captions.filter((caption) => !existingIds.has(caption.id) && !isDeletedCaption(caption))
        const loadedById = new Map(captions.map((caption) => [caption.id, caption]))
        const enrichedExisting = current.captions.map((caption) => {
          const loaded = loadedById.get(caption.id)
          return loaded?.words && loaded.words.length > 0 && (!caption.words || caption.words.length === 0)
            ? { ...caption, words: loaded.words }
            : caption
        })
        const captionsChanged = enrichedExisting.some((caption, index) => caption !== current.captions[index])
        const previousSegments = current.scriptSegments ?? []
        const scriptChanged = previousSegments.length !== scriptSegments.length || scriptSegments.some((segment, index) => {
          const previous = previousSegments[index]
          return !previous || JSON.stringify(previous) !== JSON.stringify(segment)
        })
        if (additions.length === 0 && !scriptChanged && !captionsChanged) return current
        const next = { ...current, captions: [...enrichedExisting, ...additions].sort((left, right) => left.startSeconds - right.startSeconds || left.kind.localeCompare(right.kind)), scriptSegments, updatedAt: Date.now() }
        saveEditingProject(next)
        return next
      })
    })
    return () => { cancelled = true }
  }, [model.isEditingMode, model.editingProject?.id, sourceKey, captionTimingKey, derived.subtitlePath, derived.subtitleSrtPath, derived.translatedSubtitlePath, derived.translatedSubtitleSrtPath])
}
