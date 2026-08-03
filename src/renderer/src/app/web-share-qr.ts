import * as QRCode from 'qrcode'

export function createWebShareQrCode(url: string): Promise<string> {
  return QRCode.toDataURL(url, {
    errorCorrectionLevel: 'M',
    margin: 2,
    width: 176,
    color: {
      dark: '#111111',
      light: '#ffffff'
    }
  })
}
