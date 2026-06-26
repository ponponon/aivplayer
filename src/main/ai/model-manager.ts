import { access, mkdir, readdir, stat } from 'node:fs/promises'
import { constants } from 'node:fs'
import { basename, join } from 'node:path'
import type { AsrModelInfo, AsrModelManifest } from '../../shared/media-types.ts'
import { findWhisperModelManifest, getRecommendedWhisperModelManifest } from './asr-models.ts'

const WHISPER_MODEL_PREFIX = 'ggml-'
const WHISPER_MODEL_SUFFIX = '.bin'

export async function pathExists(path: string): Promise<boolean> {
  try {
    await access(path, constants.F_OK)
    return true
  } catch {
    return false
  }
}

export function getWhisperModelDirectory(userDataPath: string): string {
  return join(userDataPath, 'models', 'asr', 'whisper')
}

export function getWhisperModelPath(modelDirectory: string, manifest: AsrModelManifest): string {
  return join(modelDirectory, manifest.fileName)
}

export async function ensureModelDirectory(modelDirectory: string): Promise<void> {
  await mkdir(modelDirectory, { recursive: true })
}

export async function listWhisperModels(modelDirectory: string): Promise<AsrModelInfo[]> {
  if (!(await pathExists(modelDirectory))) {
    return []
  }

  const entries = await readdir(modelDirectory)
  const modelFiles = entries.filter(
    (entry) => entry.startsWith(WHISPER_MODEL_PREFIX) && entry.endsWith(WHISPER_MODEL_SUFFIX)
  )

  const models = await Promise.all(
    modelFiles.map(async (entry) => {
      const modelPath = join(modelDirectory, entry)
      const modelStat = await stat(modelPath)
      const fallbackId = entry.replace(WHISPER_MODEL_PREFIX, '').replace(WHISPER_MODEL_SUFFIX, '')
      const manifest = findWhisperModelManifest(entry) ?? findWhisperModelManifest(fallbackId)

      return {
        id: manifest?.id ?? fallbackId,
        name: manifest?.name ?? basename(entry, WHISPER_MODEL_SUFFIX),
        path: modelPath,
        sizeBytes: modelStat.size
      }
    })
  )

  return models.sort((a, b) => a.name.localeCompare(b.name))
}

export function selectWhisperModel(installedModels: AsrModelInfo[], requestedModelId?: string): AsrModelInfo | null {
  if (installedModels.length === 0) {
    return null
  }

  if (requestedModelId) {
    const requestedModel = installedModels.find((model) => model.id === requestedModelId)

    if (requestedModel) {
      return requestedModel
    }
  }

  const recommendedModel = getRecommendedWhisperModelManifest()
  return installedModels.find((model) => model.id === recommendedModel.id) ?? installedModels[0]
}
