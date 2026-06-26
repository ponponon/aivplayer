import { describe, expect, it } from 'vitest'
import { resolveMpvBinary } from '../../src/main/media/native-player'

describe('native player resolver', () => {
  it('uses absolute override path when executable exists', async () => {
    const binaryPath = await resolveMpvBinary({
      AIVPLAYER_MPV_BIN: process.execPath,
      PATH: ''
    })

    expect(binaryPath).toBe(process.execPath)
  })

  it('ignores relative override paths', async () => {
    const binaryPath = await resolveMpvBinary({
      AIVPLAYER_MPV_BIN: 'mpv',
      PATH: ''
    })

    expect(binaryPath).not.toBe('mpv')
  })
})
