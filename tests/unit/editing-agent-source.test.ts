import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const projectRoot = process.cwd()
const readSource = (path: string): string => readFileSync(join(projectRoot, path), 'utf8')

describe('editing Agent desktop bridge source contract', () => {
  it('keeps the external Agent path behind the existing confirmation and revision chain', () => {
    const cli = readSource('src/cli/cli-main.ts')
    const mcp = readSource('src/cli/editing-mcp.ts')
    const bridge = readSource('src/core/editing/editing-agent-bridge.ts')
    const desktopBridge = readSource('src/desktop/editing-agent-bridge.ts')
    const preload = readSource('src/preload/index.ts')
    const actions = readSource('src/renderer/src/app/use-editing-actions.ts')
    const overlays = readSource('src/renderer/src/app/app-overlays.tsx')
    const packageJson = readSource('package.json')
    const smoke = readSource('scripts/smoke-editing-agent-bridge.ts')

    expect(cli).toContain('mcp serve <project.aivproj> [--desktop] [--bridge-manifest path]')
    expect(cli).toContain("hasCliOption(parsed, 'desktop')")
    expect(mcp).toContain('proposalSink')
    expect(mcp).toContain('不会直接写文件、删除媒体或执行 shell')
    expect(mcp).not.toContain("name: 'editing_project_apply'")
    expect(bridge).toContain("const MAX_MESSAGE_BYTES = 1024 * 1024")
    expect(bridge).toContain('EDITING_AGENT_BRIDGE_PROTOCOL')
    expect(bridge).toContain('randomBytes(32)')
    expect(desktopBridge).toContain('event.sender !== window.webContents')
    expect(desktopBridge).toContain("outcome: 'cancelled'")
    expect(preload).toContain('onEditingAgentProposal')
    expect(preload).toContain('queuedEditingAgentProposals')
    expect(preload).toContain('respondEditingAgentProposal')
    expect(actions).toContain('getEditingProjectRevision(project) !== request.proposal.base.revision')
    expect(actions).toContain('scriptActions.applyEditingScriptProposal(pending.proposal)')
    expect(overlays).toContain('<EditingProposalConfirmDialog')
    expect(overlays).toContain('app.resolveEditingAgentProposal(false)')
    expect(overlays).toContain('app.resolveEditingAgentProposal(true)')
    expect(packageJson).toContain('smoke:editing-agent-bridge')
    expect(smoke).toContain('editing-proposal-cancel')
    expect(smoke).toContain('editing-proposal-confirm')
    expect(smoke).toContain('segment-agent-bridge')
  })
})
