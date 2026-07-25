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
    expect(releaseWorkflow).toContain('retry_snap_command 5 10 sudo snap install core22 --channel=latest/stable')
    expect(releaseWorkflow).toContain('snapcraft pack --verbose --destructive-mode')
  })
})
