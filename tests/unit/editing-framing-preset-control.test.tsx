import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { EditingFramingPresetControl } from '../../src/renderer/src/app/editing-framing-preset-control'
import { getEditingFramingPreset } from '../../src/core/editing/framing-presets'
import { zhCN } from '../../src/shared/i18n/locales/zh-CN'
import type { EditingVideoClip } from '../../src/shared/editing-types'

const clip: EditingVideoClip = { id: 'clip-1', sourceId: 'source-1', sourceStartSeconds: 0, sourceEndSeconds: 4 }

describe('editing framing preset control', () => {
  it('renders semantic preset cards and disables orientation-mismatched choices', () => {
    const html = renderToStaticMarkup(<EditingFramingPresetControl
      title={zhCN.editing.framingPresetTitle}
      targetLabel={zhCN.editing.framingPresetTarget}
      orientation="portrait"
      orientationHint={zhCN.editing.framingOrientationHint}
      names={zhCN.editing.framingPresetNames}
      selectedClip={clip}
      selectedClips={[clip]}
      onApply={() => undefined}
    />)

    expect(html).toContain('data-testid="editing-framing-preset-control"')
    expect(html).toContain('data-testid="editing-framing-preset-punch-in"')
    expect(html).toContain('data-testid="editing-framing-preset-corner-br"')
    expect(html).toContain('data-testid="editing-framing-preset-split-left"')
    expect(html).toContain('data-orientation-allowed="false"')
    expect(html).toContain('构图预设')
  })

  it('exposes the current target count for batch application', () => {
    const second = { ...clip, id: 'clip-2' }
    const html = renderToStaticMarkup(<EditingFramingPresetControl
      title="构图预设"
      targetLabel={(count) => `应用到 ${count} 个片段`}
      orientation="landscape"
      orientationHint="方向提示"
      names={zhCN.editing.framingPresetNames}
      selectedClip={clip}
      selectedClips={[clip, second]}
      onApply={(ids, presetId) => { void ids; void getEditingFramingPreset(presetId) }}
    />)

    expect(html).toContain('应用到 2 个片段')
    expect(html).toContain('data-orientation-allowed="true"')
  })
})
