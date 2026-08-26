import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
// @ts-expect-error JavaScript release utility is exercised through its exported test seam.
import { createDownloadManifest, createDownloadRelease, createGithubAssetFallback, selectInstallerAssets } from '../../scripts/publish-release-downloads.mjs'

const projectRoot = process.cwd()
const releaseWorkflow = readFileSync(join(projectRoot, '.github/workflows/release.yml'), 'utf8')
const syncWorkflow = readFileSync(join(projectRoot, '.github/workflows/sync-downloads.yml'), 'utf8')
const siteHtml = readFileSync(join(projectRoot, 'docs/site/index.html'), 'utf8')
const siteScript = readFileSync(join(projectRoot, 'docs/site/script.js'), 'utf8')
const siteStyles = readFileSync(join(projectRoot, 'docs/site/styles.css'), 'utf8')
const r2Cors = JSON.parse(readFileSync(join(projectRoot, 'config/r2-cors.json'), 'utf8')) as {
  rules: Array<{
    allowed: { origins: string[]; methods: string[] }
  }>
}

describe('release download selection', () => {
  it('selects all installers for every real platform and architecture', () => {
    const selected = selectInstallerAssets([
      { name: 'AIVPlayer-0.5.5-arm64-mac.zip' },
      { name: 'AIVPlayer-0.5.5-arm64.dmg' },
      { name: 'AIVPlayer-Setup-0.5.5-x64.exe' },
      { name: 'AIVPlayer-Setup-0.5.5-arm64.exe' },
      { name: 'aivplayer-0.5.5-x86_64.AppImage' },
      { name: 'aivplayer-0.5.5-amd64.deb' },
      { name: 'aivplayer-0.5.5-arm64.AppImage' }
    ])

    expect(Object.keys(selected).sort()).toEqual(['darwin-arm64', 'linux-arm64', 'linux-x64', 'win32-arm64', 'win32-x64'])
    expect(selected['darwin-arm64']['dmg'].name).toBe('AIVPlayer-0.5.5-arm64.dmg')
    expect(selected['linux-x64']['appimage'].name).toBe('aivplayer-0.5.5-x86_64.AppImage')
    expect(selected['linux-x64']['deb'].name).toBe('aivplayer-0.5.5-amd64.deb')
    expect(selected['win32-arm64']['exe'].name).toBe('AIVPlayer-Setup-0.5.5-arm64.exe')
  })

  it('keeps compatibility with older release naming', () => {
    const selected = selectInstallerAssets([
      { name: 'AIVPlayer-0.4.0-arm64-mac.zip' },
      { name: 'AIVPlayer.Setup.0.4.0.exe' },
      { name: 'AIVPlayer-0.4.0.AppImage' },
      { name: 'aivplayer_0.4.0_amd64.deb' }
    ])

    expect(Object.keys(selected).sort()).toEqual(['darwin-arm64', 'linux-x64', 'win32-x64'])
    expect(selected['linux-x64']['appimage'].name).toBe('AIVPlayer-0.4.0.AppImage')
    expect(selected['linux-x64']['deb'].name).toBe('aivplayer_0.4.0_amd64.deb')
  })

  it('creates an immutable R2 URL and a short retention manifest', () => {
    const release = createDownloadRelease({
      tag: 'v0.5.5',
      repository: 'ponponon/aivplayer',
      publicBaseUrl: 'https://releases.quniv.cn/aivplayer/releases',
      assets: {
        'win32-x64': { name: 'AIVPlayer-Setup-0.5.5-x64.exe', format: 'exe', sizeBytes: 123, sha256: 'a'.repeat(64) }
      }
    })
    const manifest = createDownloadManifest({ repository: 'ponponon/aivplayer', releases: [release] })

    expect(release.assets['win32-x64'].url).toBe('https://releases.quniv.cn/aivplayer/releases/0.5.5/AIVPlayer-Setup-0.5.5-x64.exe')
    expect(manifest.retention).toBe(1)
    expect(manifest.releases).toHaveLength(1)
  })

  it('handles multi-format assets for Linux', () => {
    const release = createDownloadRelease({
      tag: 'v0.6.0',
      repository: 'ponponon/aivplayer',
      publicBaseUrl: 'https://releases.quniv.cn/aivplayer/releases',
      assets: {
        'linux-x64': {
          appimage: { name: 'aivplayer-0.6.0-x86_64.AppImage', format: 'appimage', sizeBytes: 100, sha256: 'b'.repeat(64) },
          deb: { name: 'aivplayer-0.6.0-amd64.deb', format: 'deb', sizeBytes: 200, sha256: 'c'.repeat(64) }
        }
      }
    })

    expect(release.assets['linux-x64']['appimage'].url).toBe('https://releases.quniv.cn/aivplayer/releases/0.6.0/aivplayer-0.6.0-x86_64.AppImage')
    expect(release.assets['linux-x64']['deb'].url).toBe('https://releases.quniv.cn/aivplayer/releases/0.6.0/aivplayer-0.6.0-amd64.deb')
  })

  it('orders macOS DMG before ZIP regardless of input object order', () => {
    const release = createDownloadRelease({
      tag: 'v0.6.3',
      repository: 'ponponon/aivplayer',
      publicBaseUrl: 'https://releases.quniv.cn/aivplayer/releases',
      assets: {
        'darwin-arm64': {
          zip: { name: 'AIVPlayer-0.6.3-arm64-mac.zip', format: 'zip', sizeBytes: 200, sha256: 'd'.repeat(64) },
          dmg: { name: 'AIVPlayer-0.6.3-arm64.dmg', format: 'dmg', sizeBytes: 100, sha256: 'e'.repeat(64) }
        }
      }
    })

    expect(Object.keys(release.assets['darwin-arm64'])).toEqual(['dmg', 'zip'])
  })

  it('orders Linux formats by explicit download preference', () => {
    const release = createDownloadRelease({
      tag: 'v0.6.3',
      repository: 'ponponon/aivplayer',
      publicBaseUrl: 'https://releases.quniv.cn/aivplayer/releases',
      assets: {
        'linux-x64': {
          snap: { name: 'aivplayer-0.6.3-x86_64.snap', format: 'snap', sizeBytes: 300, sha256: 'f'.repeat(64) },
          deb: { name: 'aivplayer-0.6.3-amd64.deb', format: 'deb', sizeBytes: 200, sha256: 'a'.repeat(64) },
          appimage: { name: 'aivplayer-0.6.3-x86_64.AppImage', format: 'appimage', sizeBytes: 100, sha256: 'b'.repeat(64) }
        }
      }
    })

    expect(Object.keys(release.assets['linux-x64'])).toEqual(['appimage', 'deb', 'snap'])
  })

  it('classifies Flatpak bundles as Linux and orders them after Snap', () => {
    const selected = selectInstallerAssets([
      { name: 'AIVPlayer-x86_64.flatpak' },
      { name: 'aivplayer-0.6.4-amd64.snap' }
    ])
    expect(selected['linux-x64']['flatpak'].name).toBe('AIVPlayer-x86_64.flatpak')

    const release = createDownloadRelease({
      tag: 'v0.6.4',
      repository: 'ponponon/aivplayer',
      publicBaseUrl: 'https://releases.quniv.cn/aivplayer/releases',
      assets: {
        'linux-x64': {
          flatpak: { name: 'AIVPlayer-x86_64.flatpak', format: 'flatpak', sizeBytes: 290000000, sha256: 'c'.repeat(64), url: 'https://github.com/ponponon/aivplayer/releases/download/v0.6.4/AIVPlayer-x86_64.flatpak' },
          snap: { name: 'aivplayer-0.6.4-amd64.snap', format: 'snap', sizeBytes: 300, sha256: 'f'.repeat(64) },
          appimage: { name: 'aivplayer-0.6.4-x86_64.AppImage', format: 'appimage', sizeBytes: 100, sha256: 'b'.repeat(64) }
        }
      }
    })
    expect(Object.keys(release.assets['linux-x64'])).toEqual(['appimage', 'snap', 'flatpak'])
    expect(release.assets['linux-x64'].flatpak.url).toContain('github.com')
  })

  it('keeps oversized assets on GitHub while retaining their verified digest', async () => {
    const fallback = await createGithubAssetFallback(
      { name: 'aivplayer-0.6.4-amd64.snap' },
      { name: 'aivplayer-0.6.4-amd64.snap', size: 300100000, digest: `sha256:${'a'.repeat(64)}`, browser_download_url: 'https://github.com/example/snap' }
    )
    expect(fallback).toMatchObject({
      name: 'aivplayer-0.6.4-amd64.snap',
      sizeBytes: 300100000,
      sha256: 'a'.repeat(64),
      url: 'https://github.com/example/snap'
    })
  })

  it('builds a GitHub asset URL for an oversized local asset before the release exists', async () => {
    const fallback = await createGithubAssetFallback(
      { name: 'aivplayer-0.6.5-amd64.snap', path: join(projectRoot, 'package.json') },
      undefined,
      'https://github.com/ponponon/aivplayer/releases/download/v0.6.5/aivplayer-0.6.5-amd64.snap'
    )
    expect(fallback.url).toBe('https://github.com/ponponon/aivplayer/releases/download/v0.6.5/aivplayer-0.6.5-amd64.snap')
    expect(fallback.sizeBytes).toBeGreaterThan(0)
    expect(fallback.sha256).toMatch(/^[a-f0-9]{64}$/)
  })
})

describe('download publishing integration', () => {
  it('publishes the verified desktop release before updating the R2 manifest', () => {
    expect(releaseWorkflow).toContain('name: Publish desktop downloads to R2')
    expect(releaseWorkflow).toContain('npm run release:publish-downloads')
    expect(releaseWorkflow.indexOf('Verify GitHub remote assets')).toBeLessThan(releaseWorkflow.indexOf('Publish desktop downloads to R2'))
    expect(releaseWorkflow).toContain('CLOUDFLARE_API_TOKEN')
    expect(releaseWorkflow).not.toContain('CLOUDFLARE_R2_ACCESS_KEY_ID')
    expect(releaseWorkflow).not.toContain('CLOUDFLARE_R2_SECRET_ACCESS_KEY')
    expect(releaseWorkflow).toContain('GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}')
  })

  it('provides a manual bootstrap path for already-published releases', () => {
    expect(syncWorkflow).toContain('workflow_dispatch:')
    expect(syncWorkflow).toContain("default: v0.6.2")
    expect(syncWorkflow).toContain('Sync latest release to R2')
    expect(syncWorkflow).toContain('npm run release:publish-downloads')
    expect(syncWorkflow).toContain('CLOUDFLARE_API_TOKEN')
    expect(syncWorkflow).not.toContain('CLOUDFLARE_R2_ACCESS_KEY_ID')
    expect(syncWorkflow).not.toContain('CLOUDFLARE_R2_SECRET_ACCESS_KEY')
  })

  it('keeps only the current release in the R2 manifest', () => {
    const uploader = readFileSync(join(projectRoot, 'scripts/publish-release-downloads.mjs'), 'utf8')

    expect(uploader).toContain('const entries = [currentEntry]')
    expect(uploader).toContain('retention: 1')
    expect(uploader).not.toContain('findPreviousRelease')
    expect(uploader).not.toContain('loadExistingVersionManifest')
  })

  it('keeps the public page centered on one automatic download path', () => {
    expect(siteHtml).toContain('id="download-recommended-link"')
    expect(siteHtml).toContain('id="download-manual-link"')
    expect(siteHtml).toContain('id="download-platform-grid"')
    expect(siteHtml).toContain('id="download-architecture-chips"')
    expect(siteHtml).toContain('id="download-format-chips"')
    expect(siteHtml).toContain('id="download-version-chips"')
    expect(siteHtml).toContain('role="radiogroup"')
    expect(siteScript).toContain('platformIconSvgs')
    expect(siteScript).toContain('simple-icons/simple-icons/blob/develop/icons/apple.svg')
    expect(siteScript).toContain("platformHint.includes('mac') || platformHint.includes('darwin')")
    expect(siteScript).not.toContain('macintel')
    expect(siteScript).toContain('DOWNLOAD_MANIFEST_URL')
    expect(siteScript).toContain('detectDownloadTarget')
    expect(siteScript).toContain("getHighEntropyValues(['architecture', 'bitness'])")
    expect(siteScript).toContain('architectureUnknown')
    expect(siteScript).not.toContain('const architectureHint = [navigator.userAgentData?.architecture, navigator.userAgent]')
    expect(siteScript).toContain('FALLBACK_DOWNLOAD_MANIFEST')
    expect(siteScript).toContain("win32: ['exe']")
    expect(siteScript).toContain("darwin: ['dmg', 'zip']")
    expect(siteScript).toContain("linux: ['appimage', 'deb', 'snap', 'flatpak']")
    expect(siteScript).toContain('function orderDownloadFormats')
    expect(siteScript).toContain("version: '0.6.2'")
    expect(siteScript).toContain("version: '0.5.6'")
    expect(siteScript).not.toContain("version: '0.5.5'")
    expect(siteScript).toContain('wirePlatformCards')
    expect(siteScript).toContain('wireArchitectureChips')
    expect(siteScript).toContain('wireFormatChips')
    expect(siteScript).toContain('wireVersionChips')
  })

  it('reveals and focuses the manual chooser when architecture detection is unavailable', () => {
    expect(siteScript).toContain("chooseArchitecture: '选择平台和架构'")
    expect(siteScript).toContain('function revealDownloadChooser()')
    expect(siteScript).toContain("detail?.scrollIntoView({ behavior: 'smooth', block: 'center' })")
    expect(siteScript).toContain('firstChoice?.focus({ preventScroll: true })')
    expect(siteScript).toContain('revealDownloadChooser()')
  })

  it('uses the Cloudflare API token for R2 REST uploads without S3 credentials', () => {
    const uploader = readFileSync(join(projectRoot, 'scripts/publish-release-downloads.mjs'), 'utf8')
    expect(uploader).toContain('CLOUDFLARE_API_BASE_URL')
    expect(uploader).toContain('CLOUDFLARE_API_TOKEN')
    expect(uploader).toContain('R2_REST_MAX_UPLOAD_BYTES')
    expect(uploader).not.toContain('@aws-sdk/client-s3')
    expect(uploader).not.toContain('CLOUDFLARE_R2_ACCESS_KEY_ID')
    expect(uploader).not.toContain('CLOUDFLARE_R2_SECRET_ACCESS_KEY')
  })

  it('keeps the public download manifest readable from Pages without write access', () => {
    const rule = r2Cors.rules[0]

    expect(rule.allowed.origins).toContain('https://aivplayer.pages.dev')
    expect(rule.allowed.methods).toEqual(['GET', 'HEAD'])
    expect(JSON.stringify(r2Cors)).not.toContain('PUT')
    expect(JSON.stringify(r2Cors)).not.toContain('DELETE')
  })
})
