import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const projectRoot = process.cwd()

describe('AI workflow status layout', () => {
  it('keeps the interactive workflow status in normal layout flow', () => {
    const shell = readFileSync(join(projectRoot, 'src/renderer/src/app/app-shell.tsx'), 'utf8')
    const shellStyles = readFileSync(join(projectRoot, 'src/renderer/src/styles/player/app-shell.css'), 'utf8')
    const workflowStyles = readFileSync(join(projectRoot, 'src/renderer/src/styles/player/ai-workflow.css'), 'utf8')
    const responsiveStyles = readFileSync(join(projectRoot, 'src/renderer/src/styles/player/ai-workflow-responsive.css'), 'utf8')

    expect(shell).toContain('<div className="ai-workflow-slot"><AiWorkflowStatus /></div>')
    expect(shell.indexOf('ai-workflow-slot')).toBeLessThan(shell.indexOf('className="app-surface"'))
    expect(shellStyles).toContain('grid-template-rows: 40px auto auto auto minmax(0, 1fr);')
    expect(shellStyles).toContain('.ai-workflow-slot')
    expect(workflowStyles).not.toContain('position: fixed')
    expect(workflowStyles).not.toContain('z-index: 8')
    expect(workflowStyles).toContain('width: min(520px, calc(100% - 36px));')
    expect(workflowStyles).toContain('margin: 8px 18px 0 0;')
    expect(responsiveStyles).not.toContain('top: 48px')
    expect(responsiveStyles).not.toContain('left: 10px')
  })
})
