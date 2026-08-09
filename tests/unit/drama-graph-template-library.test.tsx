import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { DramaGraphTemplateLibrary } from '../../src/renderer/src/app/drama-graph-template-library'
import { zhCN } from '../../src/shared/i18n/locales/zh-CN'

describe('drama graph template library', () => {
  it('renders starter presets and persisted DAG template metadata', () => {
    const html = renderToStaticMarkup(<DramaGraphTemplateLibrary
      templates={[{ id: 'template-1', name: '角色一致性出图', description: '角色资产到时间线', nodes: [{ id: 'asset', type: 'asset-input', title: '资产', config: {} }], edges: [], createdAt: 1, updatedAt: 1 }]}
      copy={zhCN.drama}
      busy={false}
      onSave={() => undefined}
      onDelete={() => undefined}
    />)

    expect(html).toContain('data-testid="drama-graph-template-library"')
    expect(html).toContain('角色一致性出图')
    expect(html).toContain('角色资产到时间线')
    expect(html).toContain('1 个节点')
    expect(html).toContain('保存模板')
    expect(html).toContain('资产 → 图像 → 时间线')
  })
})
