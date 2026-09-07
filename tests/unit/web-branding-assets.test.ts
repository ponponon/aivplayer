import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const projectRoot = process.cwd()

function readPngDimensions(buffer: Buffer): { width: number; height: number } {
  expect(buffer.subarray(0, 8)).toEqual(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))
  return { width: buffer.readUInt32BE(16), height: buffer.readUInt32BE(20) }
}

describe('Web and Flatpak branding assets', () => {
  it('keeps PWA sizes, manifest references and packaged 512px artwork aligned', async () => {
    const [icon180, icon192, icon512, flatpakIcon, manifestText, indexHtml, legacySvg] = await Promise.all([
      readFile(join(projectRoot, 'src/web/public/icon-180.png')),
      readFile(join(projectRoot, 'src/web/public/icon-192.png')),
      readFile(join(projectRoot, 'src/web/public/icon-512.png')),
      readFile(join(projectRoot, 'flatpak/icon-512.png')),
      readFile(join(projectRoot, 'src/web/public/manifest.webmanifest'), 'utf8'),
      readFile(join(projectRoot, 'src/web/index.html'), 'utf8'),
      readFile(join(projectRoot, 'src/web/public/icon.svg'), 'utf8')
    ])
    const manifest = JSON.parse(manifestText) as { icons?: Array<{ src?: string; sizes?: string; type?: string }> }

    expect(readPngDimensions(icon180)).toEqual({ width: 180, height: 180 })
    expect(readPngDimensions(icon192)).toEqual({ width: 192, height: 192 })
    expect(readPngDimensions(icon512)).toEqual({ width: 512, height: 512 })
    expect(readPngDimensions(flatpakIcon)).toEqual({ width: 512, height: 512 })
    expect(flatpakIcon).toEqual(icon512)
    expect(manifest?.icons).toEqual([
      { src: '/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: '/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' }
    ])
    expect(indexHtml).toContain('<link rel="icon" type="image/png" sizes="192x192" href="/icon-192.png" />')
    expect(indexHtml).toContain('<link rel="apple-touch-icon" sizes="180x180" href="/icon-180.png" />')
    expect(legacySvg).toContain('href="/icon-512.png"')
  })
})
