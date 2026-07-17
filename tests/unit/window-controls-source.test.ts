import { describe, expect, it } from 'vitest'
import { readSource } from './test-source-utils'

describe('Linux and Windows window controls', () => {
  it('uses a frameless window for custom controls while preserving macOS native controls', () => {
    const source = readSource('src/main/window-lifecycle.ts')

    expect(source).toContain('useCustomWindowControls')
    expect(source).toContain("{ titleBarStyle: 'hidden', frame: false }")
    expect(source).toContain("titleBarStyle: 'hiddenInset'")
  })

  it('routes custom controls through dedicated IPC actions', () => {
    const mainSource = readSource('src/main/ipc-window-controls.ts')
    const preloadSource = readSource('src/preload/index.ts')
    const headerSource = readSource('src/renderer/src/app/app-header.tsx')

    expect(mainSource).toContain('WINDOW_MINIMIZE')
    expect(mainSource).toContain('WINDOW_TOGGLE_MAXIMIZE')
    expect(mainSource).toContain('WINDOW_CLOSE')
    expect(preloadSource).toContain('getWindowMaximized')
    expect(preloadSource).toContain('onWindowMaximizedChanged')
    expect(headerSource).toContain('window.aiv.minimizeWindow()')
    expect(headerSource).toContain('window.aiv.toggleMaximizeWindow()')
    expect(headerSource).toContain('window.aiv.closeWindow()')
  })

  it('gives missing ASR runtime components direct setup actions', () => {
    const source = readSource('src/renderer/src/app/asr-runtime-card.tsx')

    expect(source).toContain('autoDetectWhisperBinary')
    expect(source).toContain('selectWhisperBinary')
    expect(source).toContain('runtimeReady')
  })
})
