import { app } from 'electron'
import { getRecommendedWhisperModelManifest } from '../core/ai/asr-models'
import { runAsrModelBootstrap, createAsrModelBootstrapState, type AsrModelBootstrapState } from '../shared/asr-model-bootstrap'
import { IPC_CHANNELS } from '../shared/ipc-channels'
import { getAsrRuntime } from './desktop-services'
import { desktopState } from './desktop-state'

const recommendedManifest = getRecommendedWhisperModelManifest()
const defaultSourceId = recommendedManifest.sources[0]!.id

let bootstrapState: AsrModelBootstrapState = createAsrModelBootstrapState(recommendedManifest, defaultSourceId)
let bootstrapPromise: Promise<AsrModelBootstrapState> | null = null

function emitState(state: AsrModelBootstrapState): void {
  bootstrapState = state
  const sender = desktopState.mainWindow?.webContents
  if (sender && !sender.isDestroyed()) {
    sender.send(IPC_CHANNELS.ASR_MODEL_BOOTSTRAP_STATE_CHANGED, state)
  }
}

export function getAsrModelBootstrapState(): AsrModelBootstrapState {
  return bootstrapState
}

export function startAsrModelBootstrap(): Promise<AsrModelBootstrapState> {
  if (bootstrapPromise) return bootstrapPromise

  bootstrapPromise = runAsrModelBootstrap({
    runtime: getAsrRuntime(),
    manifest: recommendedManifest,
    sourceId: defaultSourceId,
    onState: emitState
  }).catch((error) => {
    const message = error instanceof Error ? error.message : String(error)
    const errorState: AsrModelBootstrapState = {
      ...bootstrapState,
      status: 'error',
      message,
      error: message
    }
    emitState(errorState)
    return errorState
  })

  return bootstrapPromise
}

export function startPackagedAsrModelBootstrap(): void {
  if (!app.isPackaged) return
  void startAsrModelBootstrap()
}
