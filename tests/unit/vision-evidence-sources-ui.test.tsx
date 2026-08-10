import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { VisionEvidenceSources } from '../../src/renderer/src/app/vision-evidence-sources'
import { zhCN } from '../../src/shared/i18n/locales/zh-CN'

describe('vision evidence sources UI', () => {
  it('renders the generic derived evidence management card', () => {
    const html = renderToStaticMarkup(<VisionEvidenceSources copy={zhCN.vision} kicker={zhCN.panels.visionKicker} />)
    expect(html).toContain('vision-evidence-sources')
    expect(html).toContain('视觉证据来源')
    expect(html).toContain('暂无可管理的派生视觉证据')
    expect(html).toContain('刷新来源')
    expect(html).toContain('vision-evidence-audit-filter')
    expect(html).toContain('来源状态')
  })

  it('keeps source management actions connected to the generic preload API', async () => {
    const { readFile } = await import('node:fs/promises')
    const { join } = await import('node:path')
    const projectRoot = process.cwd()
    const panel = await readFile(join(projectRoot, 'src/renderer/src/app/vision-panel.tsx'), 'utf8')
    const preload = await readFile(join(projectRoot, 'src/preload/index.ts'), 'utf8')
    const styles = await readFile(join(projectRoot, 'src/renderer/src/styles/player.css'), 'utf8')
    expect(panel).toContain('VisionEvidenceSources')
    expect(preload).toContain('listVisionEvidenceSources')
    expect(preload).toContain('auditVisionEvidenceSources')
    expect(preload).toContain('clearVisionEvidenceBatch')
    expect(styles).toContain("@import './player/vision-evidence-sources.css';")
  })
})
