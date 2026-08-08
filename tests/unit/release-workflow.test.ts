import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const projectRoot = process.cwd()
const releaseWorkflow = readFileSync(join(projectRoot, '.github/workflows/release.yml'), 'utf8')
const electronBuilder = readFileSync(join(projectRoot, 'electron-builder.yml'), 'utf8')

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
  })

  it('stages platform runtimes before packaging', () => {
    expect(releaseWorkflow.match(/release:check-runtime/g)).toHaveLength(3)
    expect(releaseWorkflow).toContain('release:build-whisper-macos')
    expect(releaseWorkflow).toContain('release:prepare-runtime -- --platform win32')
    expect(releaseWorkflow).toContain('release:prepare-runtime -- --platform linux')
    expect(releaseWorkflow).toContain('--x265-library $x265Library')
  })

  it('checks the license manifest before every platform package build', () => {
    expect(releaseWorkflow.match(/npm run check:licenses/g)).toHaveLength(3)
    expect(electronBuilder).toContain('from: LICENSE')
    expect(electronBuilder).toContain('from: docs/THIRD_PARTY_LICENSES.md')
  })

  it('installs the generated Debian package by absolute path in CI', () => {
    expect(releaseWorkflow).toContain('deb_file="$(realpath "$deb_file")"')
    expect(releaseWorkflow).toContain('dpkg-deb -f "$deb_file" Package')
  })
})
