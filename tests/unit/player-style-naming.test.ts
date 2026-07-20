import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const projectRoot = process.cwd()
const stylesDirectory = join(projectRoot, 'src/renderer/src/styles/player')
const playerCssPath = join(projectRoot, 'src/renderer/src/styles/player.css')

const getImports = (): string[] => {
  const source = readFileSync(playerCssPath, 'utf-8')
  return Array.from(source.matchAll(/@import\s+['"]\.\/player\/([^'"]+\.css)['"]\s*;/g))
    .map((match) => match[1])
}

describe('player stylesheet naming', () => {
  it('uses semantic names instead of numeric part files', () => {
    const stylesheetNames = readdirSync(stylesDirectory).filter((name) => name.endsWith('.css'))

    expect(stylesheetNames.some((name) => /^part-\d+\.css$/.test(name))).toBe(false)
  })

  it('imports each semantic stylesheet exactly once', () => {
    const stylesheetNames = readdirSync(stylesDirectory).filter((name) => name.endsWith('.css')).sort()
    const imports = getImports()

    expect(new Set(imports).size).toBe(imports.length)
    expect(imports.sort()).toEqual(stylesheetNames)
    for (const name of imports) {
      expect(readFileSync(join(stylesDirectory, name), 'utf-8')).not.toBe('')
    }
  })
})
