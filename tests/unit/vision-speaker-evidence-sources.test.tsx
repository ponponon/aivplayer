import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { VisionSpeakerEvidenceSources } from '../../src/renderer/src/app/vision-speaker-evidence-sources'
import { zhCN } from '../../src/shared/i18n/locales/zh-CN'

describe('vision speaker evidence sources', () => {
  it('renders the source management card and empty state', () => {
    const html = renderToStaticMarkup(<VisionSpeakerEvidenceSources copy={zhCN.vision} />)

    expect(html).toContain('vision-speaker-evidence-sources')
    expect(html).toContain('说话人证据来源')
    expect(html).toContain('暂无已落库的说话人证据')
    expect(html).toContain('刷新列表')
  })

  it('keeps batch source management wired into the panel and preload surface', async () => {
    const { readFile } = await import('node:fs/promises')
    const { join } = await import('node:path')
    const projectRoot = process.cwd()
    const panel = await readFile(join(projectRoot, 'src/renderer/src/app/vision-panel.tsx'), 'utf8')
    const preload = await readFile(join(projectRoot, 'src/preload/index.ts'), 'utf8')

    expect(panel).toContain('VisionEvidenceSources')
    expect(panel).toContain('<VisionEvidenceSources copy={app.copy.vision} kicker={app.copy.panels.visionKicker} />')
    expect(preload).toContain('listSpeakerDiarizationEvidenceSources')
    expect(preload).toContain('clearSpeakerDiarizationEvidenceBatch')
  })
})
