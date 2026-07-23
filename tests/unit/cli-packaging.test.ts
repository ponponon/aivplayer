import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const projectRoot = process.cwd()

describe('aivcli packaging integration', () => {
  it('ships platform launchers and installer hooks', () => {
    const builderConfig = readFileSync(join(projectRoot, 'electron-builder.yml'), 'utf8')
    const windowsLauncher = readFileSync(join(projectRoot, 'resources/cli/aivcli.cmd'), 'utf8')
    const unixLauncher = readFileSync(join(projectRoot, 'resources/cli/aivcli'), 'utf8')

    expect(existsSync(join(projectRoot, 'build/installer.nsh'))).toBe(true)
    expect(existsSync(join(projectRoot, 'build/pkg-scripts/postinstall'))).toBe(true)
    expect(existsSync(join(projectRoot, 'build/deb-after-install.sh'))).toBe(true)
    expect(existsSync(join(projectRoot, 'build/deb-after-remove.sh'))).toBe(true)
    expect(builderConfig).toContain('resources/cli/aivcli.cmd')
    expect(builderConfig).toContain('resources/cli/aivcli')
    expect(builderConfig).toContain('include: build/installer.nsh')
    expect(builderConfig).toContain('afterInstall: build/deb-after-install.sh')
    expect(builderConfig).toContain('scripts: pkg-scripts')
    expect(windowsLauncher).toContain('AIVPlayer.exe')
    expect(windowsLauncher).toContain('--cli')
    expect(unixLauncher).toContain('--cli')
  })
})
