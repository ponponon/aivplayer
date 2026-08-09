import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { createDefaultVisionEntityCatalog, createVisionEntityCatalogEntry } from '../../src/core/ai/vision-entity-catalog'
import { VisionEntityCatalog } from '../../src/renderer/src/app/vision-entity-catalog'
import { zhCN } from '../../src/shared/i18n/locales/zh-CN'

describe('vision entity catalog UI', () => {
  it('renders custom label creation fields and custom model query metadata', () => {
    const catalog = createVisionEntityCatalogEntry(createDefaultVisionEntityCatalog(1), { name: '海边', query: 'a beach scene' }, 2)
    const html = renderToStaticMarkup(<VisionEntityCatalog
      copy={zhCN.vision}
      catalog={catalog}
      onCreate={async () => undefined}
      onUpdate={async () => undefined}
      onBatchUpdate={async () => undefined}
    />)

    expect(html).toContain('添加自定义标签')
    expect(html).toContain('模型查询描述，例如 a beach scene')
    expect(html).toContain('自定义查询：a beach scene')
    expect(html).toContain('海边')
  })
})
