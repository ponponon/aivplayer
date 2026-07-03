import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const projectRoot = process.cwd()

describe('settings UI source constraints', () => {
  it('uses the gear icon for the topbar settings action', () => {
    const appSource = readFileSync(join(projectRoot, 'src/renderer/src/app/App.tsx'), 'utf-8')

    expect(appSource).toContain('Settings,')
    expect(appSource).toContain('<Settings size={17} />')
    expect(appSource).not.toContain('<Settings2 size={17} />')
  })

  it('stacks settings field labels above controls by default', () => {
    const playerCss = readFileSync(join(projectRoot, 'src/renderer/src/styles/player.css'), 'utf-8')

    expect(playerCss).toMatch(/\.settings-field\s*\{[^}]*grid-template-columns:\s*1fr;/s)
  })
})
