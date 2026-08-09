import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const projectRoot = process.cwd()
const readSource = (path: string): string => readFileSync(join(projectRoot, path), 'utf8')

describe('subtitle QA integration', () => {
  it('keeps the analyzer, editor panel and timeline wiring visible', () => {
    const analyzer = readSource('src/shared/subtitle-qa.ts')
    const component = readSource('src/renderer/src/app/editing-subtitle-qa.tsx')
    const timeline = readSource('src/renderer/src/app/editing-timeline.tsx')
    const styles = readSource('src/renderer/src/styles/player.css')
    expect(analyzer).toContain('export function analyzeSubtitleQa')
    expect(analyzer).toContain('export function repairSubtitleQaIssues')
    expect(analyzer).toContain('SUBTITLE_QA_REPAIRABLE_KINDS')
    expect(analyzer).toContain('withoutSourceAnchor')
    expect(analyzer).toContain("issue(current, 'overlap'")
    expect(component).toContain('data-testid="editing-subtitle-qa"')
    expect(component).toContain('data-testid="subtitle-qa-issue"')
    expect(component).toContain('onSeek(item.startSeconds)')
    expect(timeline).toContain('analyzeSubtitleQa(project?.captions ?? [])')
    expect(timeline).toContain('<EditingSubtitleQa')
    expect(component).toContain('onRepair')
    expect(component).toContain('subtitleQaRepair')
    expect(timeline).toContain('repairEditingSubtitleQa')
    expect(styles).toContain("./player/editing-timeline-subtitle-qa.css")
  })

  it('keeps a dedicated real-media smoke entry', () => {
    const packageJson = JSON.parse(readSource('package.json')) as { scripts?: Record<string, string> }
    const smoke = readSource('scripts/smoke-subtitle-qa.ts')
    expect(packageJson.scripts?.['smoke:subtitle-qa']).toContain('smoke-subtitle-qa.ts')
    expect(smoke).toContain('editing-subtitle-qa')
    expect(smoke).toContain('subtitle-qa-issue')
    expect(smoke).toContain('currentTime')
  })
})
