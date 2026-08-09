import type { EditingProposal } from './editing-proposal'

export const EDITING_AGENT_BRIDGE_PROTOCOL = 'aivplayer-editing-agent/1' as const

export type EditingAgentProposalRequest = {
  requestId: string
  projectPath: string
  proposal: EditingProposal
  createdAt: number
}

export type EditingAgentProposalDecision = {
  outcome: 'applied' | 'rejected' | 'stale' | 'expired' | 'cancelled'
  message?: string
}

export type EditingAgentProposalEnvelope = EditingAgentProposalRequest & {
  protocol: typeof EDITING_AGENT_BRIDGE_PROTOCOL
  token: string
}

export type EditingAgentBridgeManifest = {
  protocol: typeof EDITING_AGENT_BRIDGE_PROTOCOL
  socketPath: string
  token: string
  pid: number
  createdAt: number
}

export type EditingAgentBridgeResponse = {
  ok: boolean
  requestId?: string
  decision?: EditingAgentProposalDecision
  error?: string
}
