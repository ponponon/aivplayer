import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

describe('summary panel display states', () => {
  it('renders summary, loading and empty states exclusively', () => {
    const source = readFileSync(join(process.cwd(), 'src/renderer/src/app/summary-panel.tsx'), 'utf8')

    expect(source).toContain('const isLoading = Boolean')
    expect(source).toContain('summary ? <SummaryArticle /> : isLoading ? <SummaryLoading /> : <SummaryEmpty')
    expect(source).not.toContain('app.aiWorkflowState.status !== \'running\' && !app.isSummarizingSubtitle && !summary')
  })
})
