import { describe, expect, it } from 'vitest'
import { createWebShareQrCode } from '../../src/renderer/src/app/web-share-qr'

describe('web share QR code', () => {
  it('generates a local PNG data URL from the LAN access URL', async () => {
    const dataUrl = await createWebShareQrCode('http://192.168.1.20:43821/?access=demo')

    expect(dataUrl).toMatch(/^data:image\/png;base64,/u)
    expect(dataUrl.length).toBeGreaterThan(500)
  })
})
