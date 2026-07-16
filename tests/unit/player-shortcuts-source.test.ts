import { describe, expect, it } from 'vitest'
import { readSource } from './test-source-utils'

describe('player shortcut source constraints', () => {
  it('keeps Space playback and its current-media guard in the player surface', () => {
    const appSource = `${readSource('src/renderer/src/app/use-keyboard-shortcuts.ts')}\n${readSource('src/renderer/src/app/playback-controls.tsx')}`

    expect(appSource).toContain("if (event.code === 'Space')")
    expect(appSource).toContain('if (event.repeat || event.target instanceof HTMLButtonElement)')
    expect(appSource).toContain('model.state.currentFile?.path')
    expect(appSource).toContain('aria-keyshortcuts="Space"')
  })
})
