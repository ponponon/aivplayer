import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const projectRoot = join(__dirname, '../..')

describe('editing Agent desktop wiring', () => {
  it('keeps the socket bridge behind the desktop lifecycle and preload response API', () => {
    const channels = readFileSync(join(projectRoot, 'src/shared/ipc-channels.ts'), 'utf8')
    const desktop = readFileSync(join(projectRoot, 'src/desktop/editing-agent-bridge.ts'), 'utf8')
    const entry = readFileSync(join(projectRoot, 'src/desktop/index.ts'), 'utf8')
    const preload = readFileSync(join(projectRoot, 'src/preload/index.ts'), 'utf8')

    expect(channels).toContain('EDITING_AGENT_PROPOSAL')
    expect(channels).toContain('EDITING_AGENT_PROPOSAL_RESPONSE')
    expect(desktop).toContain('event.sender !== window.webContents')
    expect(entry).toContain('startEditingAgentBridge')
    expect(entry).toContain('stopEditingAgentBridge')
    expect(preload).toContain('onEditingAgentProposal')
    expect(preload).toContain('respondEditingAgentProposal')
  })
})
