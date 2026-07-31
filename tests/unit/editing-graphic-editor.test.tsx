import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { EditingGraphicEditor } from '../../src/renderer/src/app/editing-graphic-editor'
import { zhCN } from '../../src/shared/i18n/locales/zh-CN'

describe('editing graphic editor', () => {
  it('exposes Pireel-style enter and exit motion controls', () => {
    const html = renderToStaticMarkup(<EditingGraphicEditor
      graphic={{ id: 'graphic-1', startSeconds: 1, durationSeconds: 3, text: 'Title', position: 'center', style: 'title', enterMotion: 'slide-left', exitMotion: 'fade', motionDurationSeconds: 0.5 }}
      title={zhCN.editing.graphicEditTitle}
      textLabel={zhCN.editing.graphicText}
      textPlaceholder={zhCN.editing.graphicPlaceholder}
      saveLabel={zhCN.editing.graphicSave}
      positionLabel={zhCN.editing.graphicPosition}
      styleLabel={zhCN.editing.graphicStyle}
      titleStyleLabel={zhCN.editing.graphicStyleTitle}
      labelStyleLabel={zhCN.editing.graphicStyleLabel}
      durationLabel={zhCN.editing.graphicDuration}
      enterLabel={zhCN.editing.graphicEnter}
      exitLabel={zhCN.editing.graphicExit}
      motionDurationLabel={zhCN.editing.graphicMotionDuration}
      motionLabels={zhCN.editing.graphicMotionLabels}
      assetSaveLabel={zhCN.editing.assetSaveLabel}
      positionLabels={zhCN.editing.graphicPositionLabels}
      timelineDuration={10}
      onSaveAsset={() => undefined}
      onUpdate={() => undefined}
    />)

    expect(html).toContain('data-testid="editing-graphic-edit-enter"')
    expect(html).toContain('data-testid="editing-graphic-edit-exit"')
    expect(html).toContain('data-testid="editing-graphic-edit-motion-duration"')
    expect(html).toContain('左滑入')
    expect(html).toContain('淡入')
    expect(html).toContain('0.50s')
  })
})
