import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const projectRoot = process.cwd()
const releaseWorkflow = readFileSync(join(projectRoot, '.github/workflows/release.yml'), 'utf8')

describe('release workflow source constraints', () => {
  it('keeps platform builds separate from release publishing', () => {
    expect(releaseWorkflow).not.toContain('GH_TOKEN:')
    expect(releaseWorkflow.match(/npx electron-builder(?: --dir)? --publish never/g)).toHaveLength(4)
  })

  it('waits for the snap artifact before creating or publishing a release', () => {
    expect(releaseWorkflow).toContain('needs: [build-macos, build-windows, build-linux, build-snap]')
    expect(releaseWorkflow).toContain('needs: [build-snap, publish-release]')
    expect(releaseWorkflow).toContain('tag_name: ${{ inputs.tag || github.ref_name }}')
    expect(releaseWorkflow).toContain("github.event_name == 'workflow_dispatch'")
    expect(releaseWorkflow).toContain('retry_snap_command 5 10 sudo snap install core22 --channel=latest/stable')
    expect(releaseWorkflow).toContain('rm -rf parts stage prime')
    expect(releaseWorkflow).toContain("find . -maxdepth 1 -type f -name '*.snap' -delete")
    expect(releaseWorkflow).toContain('SNAPCRAFT_STORE_CREDENTIALS: ${{ secrets.SNAPCRAFT_STORE_CREDENTIALS }}')
    expect(releaseWorkflow).not.toContain('snapcraft login --with -')
    expect(releaseWorkflow).toContain('snapcraft pack --verbose --destructive-mode')
  })

  it('uses an explicit copy for the generated Snap payload', () => {
    const snapcraft = readFileSync(join(projectRoot, 'snap/snapcraft.yaml'), 'utf8')
    expect(snapcraft).toContain('plugin: nil')
    expect(snapcraft).toContain('desktop: snap/gui/aivplayer.desktop')
    expect(snapcraft).toContain('CRAFT_PART_INSTALL')
    expect(snapcraft).toContain('cp -a ./.')
    expect(snapcraft).not.toContain('plugin: dump')
    expect(readFileSync(join(projectRoot, 'snap/gui/aivplayer.desktop'), 'utf8')).toContain('Exec=aivplayer %U')
  })
})
