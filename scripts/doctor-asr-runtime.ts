import { homedir } from 'node:os'
import { join, resolve } from 'node:path'
import { createWhisperCppRuntime } from '../src/main/ai/whisper-cpp-runtime.ts'

function getDefaultUserDataPath(): string {
  if (process.platform === 'darwin') {
    return join(homedir(), 'Library', 'Application Support', 'AIVPlayer')
  }

  if (process.platform === 'win32') {
    return join(process.env.APPDATA || homedir(), 'AIVPlayer')
  }

  return join(process.env.XDG_CONFIG_HOME || join(homedir(), '.config'), 'AIVPlayer')
}

async function main(): Promise<void> {
  const runtime = createWhisperCppRuntime({
    userDataPath: process.env.AIVPLAYER_USER_DATA_DIR || getDefaultUserDataPath(),
    resourcePath: process.env.AIVPLAYER_RESOURCE_DIR || resolve('resources')
  })

  const status = await runtime.healthCheck()

  console.log('AIVPlayer ASR Runtime Doctor')
  console.log(`Backend: ${status.backend}`)
  console.log(`Available: ${status.available ? 'yes' : 'no'}`)
  console.log(`Whisper binary: ${status.binaryPath ?? 'not found'}`)
  console.log(`FFmpeg binary: ${status.ffmpegPath ?? 'not found'}`)
  console.log(`Model directory: ${status.modelDirectory}`)
  console.log(`Recommended model: ${status.recommendedModel}`)
  console.log('Recommended downloads:')
  for (const source of status.recommendedModelManifest.sources) {
    console.log(`- ${source.name} (${source.region}): ${source.url}`)
  }
  console.log(`Recommended RAM: ${status.recommendedModelManifest.ramRequirement}`)
  console.log(`Installed models: ${status.installedModels.length}`)

  for (const model of status.installedModels) {
    console.log(`- ${model.name} (${Math.round(model.sizeBytes / 1024 / 1024)} MB): ${model.path}`)
  }

  console.log(`Message: ${status.message}`)

  if (!status.available) {
    console.log(
      'Next: stage a whisper.cpp executable under resources/whisper.cpp, stage ffmpeg under resources/ffmpeg, then download a ggml model into the model directory above.'
    )
  }
}

void main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
