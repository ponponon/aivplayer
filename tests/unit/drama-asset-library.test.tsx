import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { DramaAssetLibrary } from '../../src/renderer/src/app/drama-asset-library'
import { zhCN } from '../../src/shared/i18n/locales/zh-CN'

describe('drama asset library', () => {
  it('renders searchable asset categories, statuses and maintenance actions', () => {
    const html = renderToStaticMarkup(<DramaAssetLibrary
      assets={[
        { id: 'character-1', projectId: 'project-1', assetType: 'character', name: '主角', description: '追查匿名信的年轻人', visualPrompt: '电影感人物肖像', status: 'ready', createdAt: 1, updatedAt: 2 },
        { id: 'location-1', projectId: 'project-1', assetType: 'location', name: '旧车站', description: '雨夜候车厅', visualPrompt: '冷色电影光影', status: 'draft', createdAt: 1, updatedAt: 2 }
      ]}
      copy={zhCN.drama}
      busy={false}
      onSave={() => undefined}
      onDelete={() => undefined}
    />)

    expect(html).toContain('data-testid="drama-asset-library"')
    expect(html).toContain('data-testid="drama-asset-search"')
    expect(html).toContain('主角')
    expect(html).toContain('旧车站')
    expect(html).toContain('就绪')
    expect(html).toContain('草稿')
    expect(html.match(/role="tab"/gu)?.length).toBe(4)
    expect(html).toContain('标记为就绪')
    expect(html.match(/编辑/gu)?.length).toBeGreaterThanOrEqual(2)
  })
})
