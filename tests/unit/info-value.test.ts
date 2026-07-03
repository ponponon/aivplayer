import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { InfoValue } from '../../src/renderer/src/app/info-value'

describe('InfoValue', () => {
  it('renders custom tooltip data instead of relying on the native title tooltip', () => {
    const markup = renderToStaticMarkup(InfoValue({ value: 'QuickTime / M...', tooltip: 'QuickTime / MOV' }))

    expect(markup).toContain('class="info-value"')
    expect(markup).toContain('data-tooltip="QuickTime / MOV"')
    expect(markup).toContain('aria-label="QuickTime / MOV"')
    expect(markup).not.toContain('title=')
  })
})
