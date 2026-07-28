import { useEffect } from 'react'
import type { AppModel } from './app/app-types'

export function useEditingSourceEffect(model: AppModel): void {
  const sourceKey = model.editingProject?.sources.map((source) => `${source.id}:${source.path}`).join('|') ?? ''
  useEffect(() => {
    const project = model.editingProject
    if (!model.isEditingMode || !project) return
    let cancelled = false
    void Promise.all(project.sources.map(async (source) => {
      if (model.state.currentFile?.path === source.path) return [source.id, model.state.currentFile] as const
      if (!await window.aiv.isMediaFileAvailable(source.path)) return null
      return [source.id, await window.aiv.createMediaFile(source.path)] as const
    })).then((entries) => {
      if (cancelled) return
      const files = entries.filter((entry): entry is readonly [string, NonNullable<AppModel['state']['currentFile']>] => entry !== null)
      model.setEditingSourceFiles((current) => ({ ...current, ...Object.fromEntries(files) }))
    }).catch(() => {})
    return () => { cancelled = true }
  }, [model.editingProject?.id, model.isEditingMode, model.state.currentFile?.path, sourceKey])
}
