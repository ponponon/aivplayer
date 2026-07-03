import { describe, expect, it } from 'vitest'
import { APP_NAME, createApplicationMenuTemplate } from '../../src/main/app-menu'

describe('application menu', () => {
  it('uses AIVPlayer as the macOS app menu label', () => {
    const template = createApplicationMenuTemplate('darwin')

    expect(APP_NAME).toBe('AIVPlayer')
    expect(template[0]?.label).toBe('AIVPlayer')
  })
})
