import { app, dialog, ipcMain } from 'electron'
import { readFile, writeFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { parseEditingProjectFile, serializeEditingProject } from '../core/editing/project-file'
import { getAppCopy } from '../shared/i18n'
import { IPC_CHANNELS } from '../shared/ipc-channels'
import type { EditingProjectFileSaveRequest, EditingProjectFileSaveResult, EditingProjectFileOpenResult } from '../shared/editing-types'
import { getCurrentLocale } from './desktop-settings'
import { addEditingProjectSourcePathHints, resolveEditingProjectPathCaseInsensitive, resolveEditingProjectSourcePathHints } from './editing-project-path-hints'
import { promptForOpenPath, promptForSavePath } from './media-dialogs'

function safeProjectName(title: string): string {
  const normalized = title.replace(/[<>:"/\\|?*]+/g, '-').trim()
  return normalized || 'aivplayer-project'
}

function defaultProjectPath(project: EditingProjectFileSaveRequest['project']): string {
  const sourcePath = project.sources[0]?.path
  const directory = sourcePath ? dirname(sourcePath) : app.getPath('documents')
  return join(directory, `${safeProjectName(project.title)}.aivproj`)
}

export function registerEditingProjectIpc(): void {
  ipcMain.handle(IPC_CHANNELS.OPEN_EDITING_PROJECT, async (): Promise<EditingProjectFileOpenResult> => {
    const copy = getAppCopy(getCurrentLocale()).editing
    const filePath = await promptForOpenPath({ title: copy.openProject, filters: [{ name: 'AIVPlayer project', extensions: ['aivproj'] }, { name: 'All files', extensions: ['*'] }] })
    if (!filePath) return { success: false, canceled: true, message: '' }
    try {
      const project = resolveEditingProjectSourcePathHints(parseEditingProjectFile(await readFile(filePath, 'utf8')), filePath, existsSync, resolveEditingProjectPathCaseInsensitive)
      return { success: true, project, filePath, message: '' }
    } catch (error) {
      return { success: false, filePath, message: `${copy.projectOpenFailed}：${error instanceof Error ? error.message : String(error)}` }
    }
  })
  ipcMain.handle(IPC_CHANNELS.SAVE_EDITING_PROJECT, async (_event, request: EditingProjectFileSaveRequest): Promise<EditingProjectFileSaveResult> => {
    const copy = getAppCopy(getCurrentLocale()).editing
    try {
      const selectedPath = await promptForSavePath({ title: copy.saveProject, defaultPath: request.suggestedPath ?? defaultProjectPath(request.project), buttonLabel: copy.saveProject, filters: [{ name: 'AIVPlayer project', extensions: ['aivproj'] }] })
      if (!selectedPath) return { success: false, canceled: true, message: '' }
      const filePath = selectedPath.toLowerCase().endsWith('.aivproj') ? selectedPath : `${selectedPath}.aivproj`
      if (existsSync(filePath)) {
        const overwrite = await dialog.showMessageBox({ type: 'warning', title: copy.projectOverwriteTitle, message: copy.projectOverwriteDescription(filePath), buttons: [copy.projectOverwriteConfirm, copy.projectOverwriteCancel], defaultId: 0, cancelId: 1, noLink: true })
        if (overwrite.response !== 0) return { success: false, canceled: true, message: '' }
      }
      await writeFile(filePath, serializeEditingProject(addEditingProjectSourcePathHints(request.project, filePath)), 'utf8')
      return { success: true, filePath, message: '' }
    } catch (error) {
      return { success: false, message: `${copy.projectSaveFailed}：${error instanceof Error ? error.message : String(error)}` }
    }
  })
}
