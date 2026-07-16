import { describe, expect, it, vi } from 'vitest'
import { getAppCopy } from '../../src/shared/i18n'
import { runAiWorkflow } from '../../src/renderer/src/app/ai-workflow-runner'
import type { AiWorkflowRunnerContext } from '../../src/renderer/src/app/ai-workflow-runner'
import type { AppDerived } from '../../src/renderer/src/app/use-app-derived'
import type { AppModel } from '../../src/renderer/src/app/app-types'

function createContext(overrides: Partial<AiWorkflowRunnerContext> = {}): AiWorkflowRunnerContext {
  const copy = getAppCopy('zh-CN')
  const model = {
    translatedSubtitleResult: null
  } as unknown as AppModel
  const derived = {
    copy,
    summarySourcePath: '/cache/translated.vtt',
    summarySourceLanguage: 'zh',
    subtitlePath: '/cache/raw.vtt',
    subtitleTranslationSourceLanguage: 'ja'
  } as unknown as AppDerived
  return {
    model,
    derived,
    mode: 'guide',
    filePath: '/videos/movie.mkv',
    targetLanguage: 'zh',
    generateSubtitle: vi.fn(),
    translation: { translateSubtitle: vi.fn(), cancelTranslation: vi.fn() },
    summary: { summarizeSubtitle: vi.fn().mockResolvedValue({ success: true }) , cancelSummary: vi.fn() },
    updateWorkflow: vi.fn(),
    assertWorkflowCanContinue: vi.fn(),
    ...overrides
  }
}

describe('AI workflow runner', () => {
  it('uses an existing target-language source for the guide without translating again', async () => {
    const context = createContext()
    await runAiWorkflow(context)

    expect(context.generateSubtitle).not.toHaveBeenCalled()
    expect(context.translation.translateSubtitle).not.toHaveBeenCalled()
    expect(context.summary.summarizeSubtitle).toHaveBeenCalledWith({
      source: { subtitlePath: '/cache/translated.vtt', sourceLanguage: 'zh' },
      openPanel: false
    })
  })

  it('skips translation when the raw subtitle is already in the target language', async () => {
    const context = createContext({
      mode: 'complete',
      derived: {
        ...createContext().derived,
        summarySourcePath: null,
        subtitleTranslationSourceLanguage: 'zh'
      } as unknown as AppDerived
    })
    await runAiWorkflow(context)

    expect(context.translation.translateSubtitle).not.toHaveBeenCalled()
    expect(context.summary.summarizeSubtitle).toHaveBeenCalledWith({
      source: { subtitlePath: '/cache/raw.vtt', sourceLanguage: 'zh', sourceType: 'raw' },
      openPanel: false
    })
  })

  it('translates before summarizing in the complete workflow', async () => {
    const translateSubtitle = vi.fn().mockResolvedValue({
      success: true,
      subtitlePath: '/cache/translated.vtt',
      sourceSubtitlePath: '/cache/raw.vtt',
      targetLanguage: 'zh'
    })
    const context = createContext({
      mode: 'complete',
      translation: { translateSubtitle, cancelTranslation: vi.fn() },
      derived: {
        ...createContext().derived,
        summarySourcePath: null
      } as unknown as AppDerived
    })
    await runAiWorkflow(context)

    expect(translateSubtitle).toHaveBeenCalledWith('zh', null)
    expect(context.summary.summarizeSubtitle).toHaveBeenCalledWith({
      source: { subtitlePath: '/cache/translated.vtt', sourceLanguage: 'zh', sourceType: 'translated' },
      openPanel: false
    })
  })
})
