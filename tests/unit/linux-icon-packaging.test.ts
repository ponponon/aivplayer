import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const projectRoot = process.cwd()

describe('Linux application icon packaging', () => {
  it('uses a hicolor-compatible 512x512 source icon', () => {
    const builderSource = readFileSync(join(projectRoot, 'electron-builder.yml'), 'utf8')
    const checkSource = readFileSync(join(projectRoot, 'scripts/check-linux-package-icon.mjs'), 'utf8')
    const workflowSource = readFileSync(join(projectRoot, '.github/workflows/release.yml'), 'utf8')
    const icon = readFileSync(join(projectRoot, 'brand/icon-linux.png'))

    expect(builderSource).toContain('linux:\n  # Ubuntu\'s hicolor theme indexes application icons up to 512x512.')
    expect(builderSource).toContain('icon: brand/icon-linux.png')
    expect(checkSource).toContain('./usr/share/icons/hicolor/512x512/apps/aivplayer.png')
    expect(workflowSource).toContain('npm run release:check-linux-icon -- --package "$deb_file"')
    expect(icon.subarray(0, 8)).toEqual(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))
    expect(icon.readUInt32BE(16)).toBe(512)
    expect(icon.readUInt32BE(20)).toBe(512)
  })
})
