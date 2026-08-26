import { describe, expect, it } from 'vitest'
import {
  calculateDownloadSpeed,
  estimateDownloadEtaMs,
  formatDownloadBytes,
  getDownloadPercent
} from '../../src/renderer/src/app/asr-model-download-progress-utils'

describe('ASR model download progress helpers', () => {
  it('formats download sizes for compact progress metadata', () => {
    expect(formatDownloadBytes(300)).toBe('300 B')
    expect(formatDownloadBytes(250 * 1024 * 1024)).toBe('250 MB')
    expect(formatDownloadBytes(1.4 * 1024 * 1024 * 1024)).toBe('1.4 GB')
  })

  it('calculates a speed only when bytes have advanced', () => {
    expect(calculateDownloadSpeed(0, 3 * 1024 * 1024, 1000)).toBe(3 * 1024 * 1024)
    expect(calculateDownloadSpeed(100, 100, 1000)).toBeNull()
    expect(calculateDownloadSpeed(200, 100, 1000)).toBeNull()
  })

  it('estimates remaining time from the current download rate', () => {
    expect(estimateDownloadEtaMs(300, 1000, 100)).toBe(7000)
    expect(estimateDownloadEtaMs(300, null, 100)).toBeNull()
    expect(estimateDownloadEtaMs(300, 1000, null)).toBeNull()
  })

  it('uses a byte-based fallback when the source does not report percent', () => {
    expect(getDownloadPercent(null, 300, 1000)).toBe(0.3)
    expect(getDownloadPercent(1.2, 300, 1000)).toBe(1)
    expect(getDownloadPercent(null, 300, null)).toBeNull()
  })
})
