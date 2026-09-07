import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const projectRoot = process.cwd()

describe('editing project content hash wiring', () => {
  it('keeps source creation, repair and smoke verification connected', () => {
    const helpers = readFileSync(join(projectRoot, 'src/renderer/src/app/editing-action-helpers.ts'), 'utf8')
    const sources = readFileSync(join(projectRoot, 'src/renderer/src/app/editing-source-actions.ts'), 'utf8')
    const actions = readFileSync(join(projectRoot, 'src/renderer/src/app/use-editing-actions.ts'), 'utf8')
    const projectActions = readFileSync(join(projectRoot, 'src/renderer/src/app/editing-project-file-actions.ts'), 'utf8')
    const repair = readFileSync(join(projectRoot, 'src/core/editing/source-repair.ts'), 'utf8')
    const projectFile = readFileSync(join(projectRoot, 'src/core/editing/project-file.ts'), 'utf8')
    const smoke = readFileSync(join(projectRoot, 'scripts/smoke-editing-project-repair.ts'), 'utf8')

    expect(helpers).toContain('contentHash?: string')
    expect(sources).toContain('getMediaContentHash')
    expect(actions).toContain('getMediaContentHash')
    expect(actions).toContain('contentHash: entry.contentHash')
    expect(projectActions).toContain('getMediaContentHash')
    expect(repair).toContain('contentHashMatches')
    expect(repair).toContain('delete reboundSource.contentHash')
    expect(projectFile).toContain('normalizeMediaContentHash')
    expect(smoke).toContain('contentHashBasisVerified')
  })
})
