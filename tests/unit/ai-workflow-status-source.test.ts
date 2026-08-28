import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const projectRoot = process.cwd()

describe('AI workflow status overlay', () => {
  it('keeps the overlay click-through without reserving a blank layout row', () => {
    const shell = readFileSync(join(projectRoot, 'src/renderer/src/app/app-shell.tsx'), 'utf8')
    const shellStyles = readFileSync(join(projectRoot, 'src/renderer/src/styles/player/app-shell.css'), 'utf8')
    const workflowStyles = readFileSync(join(projectRoot, 'src/renderer/src/styles/player/ai-workflow.css'), 'utf8')
    const responsiveStyles = readFileSync(join(projectRoot, 'src/renderer/src/styles/player/ai-workflow-responsive.css'), 'utf8')

    expect(shell).not.toContain('ai-workflow-slot')
    expect(shell.lastIndexOf('<AiWorkflowStatus />')).toBeGreaterThan(shell.indexOf('className="app-surface"'))
    expect(shellStyles).toContain('grid-template-rows: 40px auto auto minmax(0, 1fr);')
    expect(workflowStyles).toContain('position: fixed')
    expect(workflowStyles).toContain('pointer-events: none;')
    expect(workflowStyles).toContain('width: min(520px, calc(100vw - 36px));')
    expect(workflowStyles).toContain('pointer-events: auto;')
    expect(responsiveStyles).toContain('top: 48px')
    expect(responsiveStyles).toContain('left: 10px')
  })
})
