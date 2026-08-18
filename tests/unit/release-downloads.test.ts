import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
// @ts-expect-error JavaScript release utility is exercised through its exported test seam.
import { createDownloadManifest, createDownloadRelease, selectInstallerAssets } from '../../scripts/publish-release-downloads.mjs'

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
  it('selects one installer for every real platform and architecture', () => {
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
    expect(selected['darwin-arm64'].name).toBe('AIVPlayer-0.5.5-arm64.dmg')
    expect(selected['linux-x64'].name).toBe('aivplayer-0.5.5-x86_64.AppImage')
    expect(selected['win32-arm64'].name).toBe('AIVPlayer-Setup-0.5.5-arm64.exe')
  })

  it('keeps compatibility with older release naming', () => {
    const selected = selectInstallerAssets([
      { name: 'AIVPlayer-0.4.0-arm64-mac.zip' },
      { name: 'AIVPlayer.Setup.0.4.0.exe' },
      { name: 'AIVPlayer-0.4.0.AppImage' },
      { name: 'aivplayer_0.4.0_amd64.deb' }
    ])

    expect(Object.keys(selected).sort()).toEqual(['darwin-arm64', 'linux-x64', 'win32-x64'])
    expect(selected['linux-x64'].name).toBe('AIVPlayer-0.4.0.AppImage')
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
    expect(manifest.retention).toBe(2)
    expect(manifest.releases).toHaveLength(1)
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
    expect(syncWorkflow).toContain("default: v0.6.0")
    expect(syncWorkflow).toContain('npm run release:publish-downloads')
    expect(syncWorkflow).toContain('CLOUDFLARE_API_TOKEN')
    expect(syncWorkflow).not.toContain('CLOUDFLARE_R2_ACCESS_KEY_ID')
    expect(syncWorkflow).not.toContain('CLOUDFLARE_R2_SECRET_ACCESS_KEY')
  })

  it('keeps the public page centered on one automatic download path', () => {
    expect(siteHtml).toContain('id="download-recommended-link"')
    expect(siteHtml).toContain('id="download-history-panel"')
    expect(siteHtml).toContain('id="download-history-download-link"')
    expect(siteHtml).toContain('id="download-manual"')
    expect(siteHtml).toContain('id="download-platform-select"')
    expect(siteHtml).toContain('id="download-architecture-select"')
    expect(siteHtml).toContain('role="listbox"')
    expect(siteHtml).not.toContain('<select id="download-platform-select"')
    expect(siteScript).toContain('wireDownloadSelect')
    expect(siteScript).toContain('platformIconSvgs')
    expect(siteScript).toContain('simple-icons/simple-icons/blob/develop/icons/apple.svg')
    expect(siteScript).toContain("platformHint.includes('mac') || platformHint.includes('darwin')")
    expect(siteScript).not.toContain('macintel')
    expect(siteStyles).toContain('.download-select-menu')
    expect(siteScript).toContain('DOWNLOAD_MANIFEST_URL')
    expect(siteScript).toContain('detectDownloadTarget')
    expect(siteScript).toContain("getHighEntropyValues(['architecture', 'bitness'])")
    expect(siteScript).toContain('architectureUnknown')
    expect(siteScript).not.toContain('const architectureHint = [navigator.userAgentData?.architecture, navigator.userAgent]')
    expect(siteScript).toContain('FALLBACK_DOWNLOAD_MANIFEST')
    expect(siteScript).toContain("version: '0.6.0'")
    expect(siteScript).toContain("version: '0.5.6'")
    expect(siteScript).not.toContain("version: '0.5.5'")
    expect(siteScript).toContain('selectedHistoryVersion')
    expect(siteScript).toContain("wireDownloadSelect('history')")
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
