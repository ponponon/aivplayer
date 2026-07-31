import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { zhCN } from '../../src/shared/i18n/locales/zh-CN'
import { EditingAssetsPanel } from '../../src/renderer/src/app/editing-assets-panel'

describe('editing assets panel', () => {
  it('renders project sources as searchable draggable assets with two insertion actions', () => {
    const html = renderToStaticMarkup(<EditingAssetsPanel
      sources={[
        { id: 'source-main', path: '/videos/main.mp4', name: 'main.mp4', fingerprint: 'main:10', durationSeconds: 10, width: 1920, height: 1080 },
        { id: 'source-broll', path: '/videos/broll.mp4', name: 'broll.mp4', fingerprint: 'broll:6', durationSeconds: 6 }
      ]}
      sourceFiles={{
        'source-main': { id: 'file-main', path: '/videos/main.mp4', name: 'main.mp4', url: 'file:///videos/main.mp4', extension: 'mp4' },
        'source-broll': { id: 'file-broll', path: '/videos/broll.mp4', name: 'broll.mp4', url: 'file:///videos/broll.mp4', extension: 'mp4' }
      }}
      filmstrips={{ 'source-main': [{ sourceSeconds: 1, url: 'data:image/png;base64,main' }, { sourceSeconds: 5, url: 'data:image/png;base64,main2' }] }}
      usedSourceIds={['source-main']}
      copy={zhCN.editing}
      onInsertMain={() => undefined}
      onAppendMain={() => undefined}
      onInsertOverlay={() => undefined}
    />)

    expect(html).toContain('data-testid="editing-assets-panel"')
    expect(html).toContain('main.mp4')
    expect(html).toContain('broll.mp4')
    expect(html).toContain('data:image/png;base64,main')
    expect(html).toContain('editing-asset-preview-source-main')
    expect(html.match(/draggable="true"/gu)?.length).toBe(2)
    expect(html.match(/插入主轨/gu)?.length).toBeGreaterThanOrEqual(2)
    expect(html.match(/插入画中画/gu)?.length).toBeGreaterThanOrEqual(2)
    expect(html.match(/role="tab"/gu)?.length).toBe(3)
    expect(html).toContain('时间线中')
    expect(html).toContain('未使用')
  })
})
