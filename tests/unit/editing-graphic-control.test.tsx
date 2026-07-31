import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { zhCN } from '../../src/shared/i18n/locales/zh-CN'
import { EditingGraphicControl } from '../../src/renderer/src/app/editing-graphic-control'

describe('editing graphic control', () => {
  it('exposes reusable local element presets alongside custom text input', () => {
    const html = renderToStaticMarkup(<EditingGraphicControl
      title={zhCN.editing.graphicTitle}
      textLabel={zhCN.editing.graphicText}
      textPlaceholder={zhCN.editing.graphicPlaceholder}
      addLabel={zhCN.editing.graphicAdd}
      positionLabel={zhCN.editing.graphicPosition}
      styleLabel={zhCN.editing.graphicStyle}
      titleStyleLabel={zhCN.editing.graphicStyleTitle}
      labelStyleLabel={zhCN.editing.graphicStyleLabel}
      durationLabel={zhCN.editing.graphicDuration}
      presetLabel={zhCN.editing.graphicPresetLabel}
      presetLabels={zhCN.editing.graphicPresetLabels}
      presetTexts={zhCN.editing.graphicPresetTexts}
      assetLibraryLabel={zhCN.editing.assetLibraryLabel}
      assetSearchPlaceholder={zhCN.editing.assetSearchPlaceholder}
      assetEmptyLabel={zhCN.editing.assetEmptyLabel}
      assetDeleteLabel={zhCN.editing.assetDeleteLabel}
      assets={[]}
      onDeleteAsset={() => undefined}
      defaultPosition="center"
      defaultStyle="title"
      positionLabels={zhCN.editing.graphicPositionLabels}
      currentTime={0}
      timelineDuration={10}
      onAdd={() => undefined}
    />)

    expect(html).toContain('快速元素')
    expect(html).toContain('data-testid="editing-graphic-preset-title"')
    expect(html).toContain('data-testid="editing-graphic-preset-label"')
    expect(html).toContain('data-testid="editing-graphic-preset-quote"')
    expect(html).toContain('data-testid="editing-graphic-text"')
    expect(html).toContain('我的元素')
  })
})
