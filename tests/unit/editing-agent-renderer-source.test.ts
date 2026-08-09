import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const projectRoot = join(__dirname, '../..')

describe('editing Agent Renderer state', () => {
  it('keeps proposal acceptance behind project identity and revision checks', () => {
    const model = readFileSync(join(projectRoot, 'src/renderer/src/app/use-app-model.ts'), 'utf8')
    const actions = readFileSync(join(projectRoot, 'src/renderer/src/app/use-editing-actions.ts'), 'utf8')

    expect(model).toContain('editingAgentProposal')
    expect(actions).toContain('getEditingProjectRevision(project) !== request.proposal.base.revision')
    expect(actions).toContain('scriptActions.applyEditingScriptProposal(pending.proposal)')
    expect(actions).toContain("outcome: 'stale'")
    expect(actions).toContain("'cancelled'")
  })
})
