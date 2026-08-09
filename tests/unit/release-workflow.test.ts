import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const projectRoot = process.cwd()
const releaseWorkflow = readFileSync(join(projectRoot, '.github/workflows/release.yml'), 'utf8')
const packageJson = readFileSync(join(projectRoot, 'package.json'), 'utf8')
const electronBuilder = readFileSync(join(projectRoot, 'electron-builder.yml'), 'utf8')
const giteeSync = readFileSync(join(projectRoot, 'scripts/sync-gitee-release.mjs'), 'utf8')
const artifactPolicy = readFileSync(join(projectRoot, 'scripts/release-artifact-policy.mjs'), 'utf8')
const remoteVerification = readFileSync(join(projectRoot, 'scripts/verify-remote-release.mjs'), 'utf8')
const releaseVersion = readFileSync(join(projectRoot, 'scripts/check-release-version.mjs'), 'utf8')
const platformRelease = readFileSync(join(projectRoot, 'scripts/check-platform-release-artifacts.mjs'), 'utf8')
const packageFormats = readFileSync(join(projectRoot, 'scripts/check-release-package-formats.mjs'), 'utf8')
const platformEvidence = readFileSync(join(projectRoot, 'scripts/check-platform-evidence.mjs'), 'utf8')
const releaseDryRun = readFileSync(join(projectRoot, 'scripts/release-dry-run.mjs'), 'utf8')

describe('release workflow source constraints', () => {
  it('keeps platform builds separate from release publishing', () => {
    expect(releaseWorkflow).not.toContain('GH_TOKEN:')
    expect(releaseWorkflow.match(/npx electron-builder(?: --dir)? --publish never/g)).toHaveLength(3)
    expect(releaseWorkflow).not.toContain('build-snap')
    expect(releaseWorkflow).not.toContain('publish-snap')
    expect(releaseWorkflow).not.toContain('SNAPCRAFT_STORE_CREDENTIALS')
  })

  it('waits for all desktop artifacts before creating a release', () => {
    expect(releaseWorkflow).toContain('needs: [build-macos, build-windows, build-linux]')
    expect(releaseWorkflow).toContain('tag_name: ${{ inputs.tag || github.ref_name }}')
    expect(releaseWorkflow).toContain('release:create-manifest')
    expect(releaseWorkflow).toContain('release:check-manifest')
    expect(releaseWorkflow).toContain('release:check-version')
    expect(releaseWorkflow).toContain('artifacts/release-manifest.json')
    expect(releaseWorkflow).toContain('name: release-manifest')
    expect(releaseWorkflow).toContain('--commit "${{ github.sha }}"')
    expect(releaseWorkflow).toContain('--repository "${{ github.repository }}"')
    expect(releaseWorkflow).toContain('--workflow "${{ github.workflow }}"')
    expect(releaseWorkflow).toContain('--workflow-run-id "${{ github.run_id }}"')
    expect(releaseWorkflow).toContain('--workflow-run-attempt "${{ github.run_attempt }}"')
  })

  it('supports a verify-only workflow dispatch without remote release writes', () => {
    expect(releaseWorkflow).toContain('verify_only:')
    expect(releaseWorkflow).toContain('description: \'Build and validate all release artifacts without creating or syncing a release\'')
    expect(releaseWorkflow).toContain('default: false')
    expect(releaseWorkflow).toContain('type: boolean')
    expect(releaseWorkflow.match(/github\.event_name != 'workflow_dispatch' \|\| inputs\.verify_only != true/g)).toHaveLength(4)
    expect(releaseWorkflow.indexOf('release:check-evidence')).toBeLessThan(releaseWorkflow.indexOf('Create GitHub Release'))
    expect(releaseWorkflow.indexOf('Create GitHub Release')).toBeLessThan(releaseWorkflow.indexOf('sync-gitee-release:'))
  })

  it('stages platform runtimes before packaging', () => {
    expect(releaseWorkflow.match(/release:check-runtime/g)).toHaveLength(3)
    expect(releaseWorkflow.match(/release:prepare-vision-model/g)).toHaveLength(3)
    expect(releaseWorkflow.match(/release:write-runtime-metadata/g)).toHaveLength(3)
    expect(releaseWorkflow).toContain('release:build-whisper-macos')
    expect(releaseWorkflow).toContain('release:prepare-runtime -- --platform win32')
    expect(releaseWorkflow).toContain('release:prepare-runtime -- --platform linux')
    expect(releaseWorkflow).toContain('--x265-library $x265Library')
  })

  it('checks the license manifest before every platform package build', () => {
    expect(releaseWorkflow.match(/npm run check:licenses/g)).toHaveLength(3)
    expect(electronBuilder).toContain('from: LICENSE')
    expect(electronBuilder).toContain('from: docs/THIRD_PARTY_LICENSES.md')
    expect(electronBuilder).toContain('from: resources/runtime-metadata.json')
    expect(electronBuilder).toContain('resources/vision/siglip2-base-patch16-224-ONNX')
  })

  it('installs the generated Debian package by absolute path in CI', () => {
    expect(releaseWorkflow).toContain('deb_file="$(realpath "$deb_file")"')
    expect(releaseWorkflow).toContain('dpkg-deb -f "$deb_file" Package')
  })

  it('keeps Gitee artifact selection aligned with GitHub releases', () => {
    expect(releaseWorkflow).toContain('node scripts/sync-gitee-release.mjs')
    expect(giteeSync).toContain('listReleaseArtifacts')
    expect(giteeSync).toContain('verifyReleaseManifest')
    expect(artifactPolicy).toContain("RELEASE_MANIFEST_NAME = 'release-manifest.json'")
    expect(artifactPolicy).toContain("/^latest(?:-[^/]+)?\\.yml$/i")
    expect(releaseWorkflow).toContain('release/latest*.yml')
    expect(releaseWorkflow).toContain('artifacts/**/latest*.yml')
    expect(giteeSync).toContain('const names = new Set(files.map((file) => basename(file)))')
    expect(giteeSync).toContain('RELEASE_TAG')
    expect(giteeSync).toContain('GITEE_TARGET_COMMITISH')
  })

  it('reads back both remote releases after publishing without write APIs', () => {
    expect(releaseWorkflow).toContain('name: Verify GitHub remote assets')
    expect(releaseWorkflow).toContain('--platform github')
    expect(releaseWorkflow).toContain('name: Verify Gitee remote assets')
    expect(releaseWorkflow).toContain('--platform gitee')
    expect(releaseWorkflow).toContain('remote-verification-github')
    expect(releaseWorkflow).toContain('remote-verification-gitee')
    expect(remoteVerification).toContain('sha256File')
    expect(remoteVerification).toContain('Readable.fromWeb')
    expect(remoteVerification).toContain('redirect: \'follow\'')
    expect(remoteVerification).not.toContain("method: 'POST'")
    expect(remoteVerification).not.toContain("method: 'DELETE'")
  })

  it('keeps the release tag, package version and updater metadata tied together', () => {
    expect(releaseVersion).toContain('tag/version mismatch')
    expect(releaseVersion).toContain('Update metadata version mismatch')
    expect(releaseVersion).toContain('references missing artifact')
    expect(releaseVersion).toContain('No electron-updater latest*.yml metadata')
  })

  it('checks each platform package set before uploading artifacts', () => {
    expect(releaseWorkflow.match(/release:check-platform/g)).toHaveLength(3)
    expect(releaseWorkflow).toContain('--platform macos --artifacts-dir release')
    expect(releaseWorkflow).toContain('--platform windows --artifacts-dir release')
    expect(releaseWorkflow).toContain('--platform linux --artifacts-dir release')
    expect(platformRelease).toContain("packages: ['.dmg', '.zip', '.pkg']")
    expect(platformRelease).toContain("packages: ['.AppImage', '.deb']")
    expect(platformRelease).toContain('unexpected packages')
  })

  it('retains one hash report per build runner without publishing reports as release assets', () => {
    expect(releaseWorkflow).toContain('release-evidence-macos')
    expect(releaseWorkflow).toContain('release-evidence-windows')
    expect(releaseWorkflow).toContain('release-evidence-linux')
    expect(releaseWorkflow).toContain('platform-release-report-macos.json')
    expect(releaseWorkflow).toContain('platform-release-report-windows.json')
    expect(releaseWorkflow).toContain('platform-release-report-linux.json')
    expect(platformRelease).toContain('sha256File')
    expect(platformRelease).toContain('reportPath')
    expect(platformRelease).toContain('duplicate names')
  })

  it('verifies evidence after artifact merge and before version / manifest checks', () => {
    expect(releaseWorkflow).toContain('release:check-evidence')
    expect(releaseWorkflow).toContain('--report-path artifacts/merged-platform-evidence.json')
    expect(releaseWorkflow).toContain('name: release-evidence-merged')
    expect(releaseWorkflow.indexOf('release:check-evidence')).toBeLessThan(releaseWorkflow.indexOf('release:check-version'))
    expect(platformEvidence).toContain('Missing platform evidence report')
    expect(platformEvidence).toContain('Merged release evidence SHA-256 changed')
    expect(platformEvidence).toContain('reports overlap on artifact')
  })

  it('checks package format signatures before uploading artifacts', () => {
    expect(releaseWorkflow.match(/release:check-formats/g)).toHaveLength(3)
    expect(packageFormats).toContain("case '.dmg':")
    expect(packageFormats).toContain("case '.pkg':")
    expect(packageFormats).toContain("case '.exe':")
    expect(packageFormats).toContain("case '.deb':")
    expect(packageFormats).toContain("case '.appimage':")
  })

  it('keeps the local release dry-run offline and separate from remote publishing', () => {
    expect(packageJson).toContain('"release:dry-run"')
    expect(releaseDryRun).not.toContain('sync-gitee-release')
    expect(releaseDryRun).not.toContain('verify-remote-release')
    expect(releaseDryRun).not.toContain('fetch(')
    expect(releaseDryRun).toContain('checkPlatformEvidence')
    expect(releaseDryRun).toContain('verifyReleaseManifest')
  })
})
