import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { DramaGenerationQueue } from '../../src/renderer/src/app/drama-generation-queue'
import { zhCN } from '../../src/shared/i18n/locales/zh-CN'

describe('drama generation queue', () => {
  it('renders independent media filters, target selection and cancellable tasks', () => {
    const html = renderToStaticMarkup(<DramaGenerationQueue
      assets={[{ id: 'asset-1', projectId: 'project-1', assetType: 'character', name: '主角', description: '', visualPrompt: '', status: 'ready', createdAt: 1, updatedAt: 1 }]}
      tasks={[
        { id: 'image-task', projectId: 'project-1', mediaType: 'image', targetId: 'asset-1', prompt: '角色肖像', status: 'queued', progress: 0, message: '等待生成', createdAt: 1 },
        { id: 'audio-task', projectId: 'project-1', mediaType: 'audio', prompt: '雨声', status: 'completed', progress: 1, message: '已完成', createdAt: 2 }
      ]}
      copy={zhCN.drama}
      busy={false}
      onCreate={() => undefined}
      onCancel={() => undefined}
    />)

    expect(html).toContain('data-testid="drama-generation-queue"')
    expect(html).toContain('data-testid="drama-generation-list"')
    expect(html).toContain('角色肖像')
    expect(html).toContain('雨声')
    expect(html).toContain('主角')
    expect(html.match(/role="tab"/gu)?.length).toBe(4)
    expect(html).toContain('取消任务')
    expect(html).toContain('已完成')
  })
})
