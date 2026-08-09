import { app, ipcMain } from 'electron'
import { EditingAgentBridgeServer } from '../core/editing/editing-agent-bridge'
import type { EditingAgentProposalDecision, EditingAgentProposalRequest } from '../shared/editing-agent'
import { IPC_CHANNELS } from '../shared/ipc-channels'
import { desktopState } from './desktop-state'

const REQUEST_TIMEOUT_MS = 5 * 60 * 1000

type PendingRequest = {
  resolve: (decision: EditingAgentProposalDecision) => void
  timer: ReturnType<typeof setTimeout>
}

let bridge: EditingAgentBridgeServer | null = null
const pendingRequests = new Map<string, PendingRequest>()

export function registerEditingAgentBridgeIpc(): void {
  ipcMain.handle(IPC_CHANNELS.EDITING_AGENT_PROPOSAL_RESPONSE, (event, value: unknown): { ok: boolean } => {
    const window = desktopState.mainWindow
    if (!window || window.isDestroyed() || event.sender !== window.webContents) return { ok: false }
    if (!isDecisionEnvelope(value)) return { ok: false }
    const pending = pendingRequests.get(value.requestId)
    if (!pending) return { ok: false }
    clearTimeout(pending.timer)
    pendingRequests.delete(value.requestId)
    pending.resolve(value.decision)
    return { ok: true }
  })
}

export async function startEditingAgentBridge(): Promise<void> {
  if (bridge) return
  bridge = new EditingAgentBridgeServer({
    userDataPath: requireUserDataPath(),
    requestTimeoutMs: REQUEST_TIMEOUT_MS,
    onProposal: awaitProposalFromRenderer
  })
  try {
    await bridge.start()
  } catch (error) {
    bridge = null
    throw error
  }
}

export async function stopEditingAgentBridge(): Promise<void> {
  for (const [requestId, pending] of pendingRequests) {
    clearTimeout(pending.timer)
    pending.resolve({ outcome: 'cancelled', message: 'AIVPlayer 正在关闭，未应用 Agent Proposal' })
    pendingRequests.delete(requestId)
  }
  const current = bridge
  bridge = null
  if (current) await current.stop()
}

async function awaitProposalFromRenderer(request: EditingAgentProposalRequest): Promise<EditingAgentProposalDecision> {
  const window = desktopState.mainWindow
  if (!window || window.isDestroyed()) return { outcome: 'rejected', message: '桌面编辑器窗口不可用' }
  return new Promise<EditingAgentProposalDecision>((resolve) => {
    const timer = setTimeout(() => {
      pendingRequests.delete(request.requestId)
      resolve({ outcome: 'expired', message: '等待桌面端确认超时' })
    }, REQUEST_TIMEOUT_MS)
    pendingRequests.set(request.requestId, { resolve, timer })
    window.webContents.send(IPC_CHANNELS.EDITING_AGENT_PROPOSAL, request)
  })
}

function isDecisionEnvelope(value: unknown): value is { requestId: string; decision: EditingAgentProposalDecision } {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false
  const object = value as Record<string, unknown>
  const decision = object.decision
  if (!object.requestId || typeof object.requestId !== 'string' || !decision || typeof decision !== 'object' || Array.isArray(decision)) return false
  const outcome = (decision as Record<string, unknown>).outcome
  return outcome === 'applied' || outcome === 'rejected' || outcome === 'stale' || outcome === 'expired' || outcome === 'cancelled'
}

function requireUserDataPath(): string {
  return app.getPath('userData')
}
