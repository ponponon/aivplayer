import { app, dialog } from 'electron'
import { existsSync } from 'node:fs'
import { readdir } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { getAppCopy } from '../shared/i18n'
import type { MediaFile } from '../shared/media-types'
import { VIDEO_EXTENSIONS, extractVideoFilePaths, isVideoFilePath } from './media/file-opening'
import { createMediaFile } from './media/media-protocol'
import { getCurrentLocale } from './main-settings'
import { mainState } from './main-state'

export async function listMediaFilesInDirectory(directoryPath: string, recursive = false): Promise<MediaFile[]> {
  if (!directoryPath || !existsSync(directoryPath)) return []
  const entries = await readdir(directoryPath, { withFileTypes: true })
  const files = entries.filter((entry) => entry.isFile()).map((entry) => join(directoryPath, entry.name)).filter(isVideoFilePath)
  const mediaFiles = await Promise.all(files.sort().map((path) => createMediaFile(path)))
  if (!recursive) return mediaFiles
  const nested = await Promise.all(entries.filter((entry) => entry.isDirectory()).map((entry) => listMediaFilesInDirectory(join(directoryPath, entry.name), true)))
  return [...mediaFiles, ...nested.flat()].sort((left, right) => left.path.localeCompare(right.path, undefined, { numeric: true, sensitivity: 'base' }))
}

export async function expandMediaFiles(files: MediaFile[]): Promise<MediaFile[]> {
  if (files.length !== 1 || !mainState.currentAppSettings.media.autoLoadSameDirectoryFiles) return files
  const siblings = await listMediaFilesInDirectory(dirname(files[0].path))
  const unique = new Map<string, MediaFile>()
  for (const file of [...siblings, ...files]) unique.set(file.path, file)
  return Array.from(unique.values())
}

export async function promptForMediaFiles(): Promise<MediaFile[]> {
  const copy = getAppCopy(getCurrentLocale())
  const result = mainState.mainWindow ? await dialog.showOpenDialog(mainState.mainWindow, mediaFileDialogOptions(copy.topbar.openFiles)) : await dialog.showOpenDialog(mediaFileDialogOptions(copy.topbar.openFiles))
  if (result.canceled) return []
  return expandMediaFiles(await Promise.all(extractVideoFilePaths(result.filePaths).map((path) => createMediaFile(path))))
}

function mediaFileDialogOptions(title: string): Electron.OpenDialogOptions {
  return { defaultPath: mainState.currentAppSettings.media.defaultOpenDirectoryPath ?? undefined, title, properties: ['openFile', 'multiSelections'], filters: [{ name: 'Video files', extensions: [...VIDEO_EXTENSIONS] }, { name: 'All files', extensions: ['*'] }] }
}

export async function promptForDirectory(options: { title: string; defaultPath?: string | null }): Promise<string | null> {
  const dialogOptions: Electron.OpenDialogOptions = { title: options.title, defaultPath: options.defaultPath ?? undefined, properties: ['openDirectory', 'createDirectory'] }
  const result = mainState.mainWindow ? await dialog.showOpenDialog(mainState.mainWindow, dialogOptions) : await dialog.showOpenDialog(dialogOptions)
  return result.canceled || result.filePaths.length === 0 ? null : result.filePaths[0]
}

export async function promptForSavePath(options: { title: string; defaultPath?: string | null; buttonLabel?: string; filters?: Electron.FileFilter[] }): Promise<string | null> {
  const dialogOptions: Electron.SaveDialogOptions = { title: options.title, defaultPath: options.defaultPath ?? undefined, buttonLabel: options.buttonLabel, filters: options.filters }
  const result = mainState.mainWindow ? await dialog.showSaveDialog(mainState.mainWindow, dialogOptions) : await dialog.showSaveDialog(dialogOptions)
  return result.canceled || !result.filePath ? null : result.filePath
}

export function getInitialMediaFiles(): MediaFile[] {
  if (mainState.initialMediaFiles) return mainState.initialMediaFiles
  const paths = extractVideoFilePaths([...process.argv.slice(1), ...mainState.pendingMediaPaths])
  mainState.initialMediaFiles = paths.map(createMediaFile)
  mainState.pendingMediaPaths = []
  return mainState.initialMediaFiles
}
