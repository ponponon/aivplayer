import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'

export type AsrRuntimeSettings = {
  whisperBinaryPath?: string
}

export function getAsrRuntimeSettingsPath(userDataPath: string): string {
  return join(userDataPath, 'asr-runtime-settings.json')
}

export async function readAsrRuntimeSettings(userDataPath: string): Promise<AsrRuntimeSettings> {
  try {
    const content = await readFile(getAsrRuntimeSettingsPath(userDataPath), 'utf-8')
    const parsed = JSON.parse(content) as AsrRuntimeSettings

    return {
      whisperBinaryPath: typeof parsed.whisperBinaryPath === 'string' ? parsed.whisperBinaryPath : undefined
    }
  } catch {
    return {}
  }
}

export async function writeAsrRuntimeSettings(userDataPath: string, settings: AsrRuntimeSettings): Promise<void> {
  const settingsPath = getAsrRuntimeSettingsPath(userDataPath)

  await mkdir(dirname(settingsPath), { recursive: true })
  await writeFile(settingsPath, `${JSON.stringify(settings, null, 2)}\n`)
}

export async function saveWhisperBinaryPath(userDataPath: string, whisperBinaryPath: string): Promise<void> {
  const settings = await readAsrRuntimeSettings(userDataPath)

  await writeAsrRuntimeSettings(userDataPath, {
    ...settings,
    whisperBinaryPath
  })
}
