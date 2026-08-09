import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { VisionIndexFailures } from '../../src/renderer/src/app/vision-index-failures'
import { zhCN } from '../../src/shared/i18n/locales/zh-CN'

describe('vision index failures', () => {
  it('renders recoverable records and exposes individual and batch retry actions', () => {
    const html = renderToStaticMarkup(<VisionIndexFailures
      copy={zhCN.vision}
      failures={[{
        id: 'failure-1',
        mediaPath: '/media/demo.mp4',
        fileName: 'demo.mp4',
        error: '无法读取视频',
        failedAt: 10,
        lastAttemptAt: 20,
        retryCount: 2,
        intervalSeconds: 3,
        includeSceneEvidence: false,
        includeEntityEvidence: true,
        stage: 'frames'
      }]}
      onRetry={async () => undefined}
      onBatchRetry={async () => undefined}
    />)

    expect(html).toContain('待恢复的索引任务')
    expect(html).toContain('demo.mp4')
    expect(html).toContain('无法读取视频')
    expect(html).toContain('重试 2 次')
    expect(html).toContain('全选失败任务')
    expect(html).toContain('type="checkbox"')
  })

  it('does not render an empty failure section', () => {
    const html = renderToStaticMarkup(<VisionIndexFailures copy={zhCN.vision} failures={[]} onRetry={async () => undefined} onBatchRetry={async () => undefined} />)
    expect(html).toBe('')
  })
})
