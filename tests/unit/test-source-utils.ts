import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { expect } from 'vitest'

const projectRoot = process.cwd()

export const readSource = (filePath: string): string => {
  const source = readFileSync(join(projectRoot, filePath), 'utf-8')
  if (filePath === 'src/renderer/src/styles/player.css') {
    const parts = readdirSync(join(projectRoot, 'src/renderer/src/styles/player'))
      .filter((name) => name.endsWith('.css'))
      .sort()
      .map((name) => readFileSync(join(projectRoot, 'src/renderer/src/styles/player', name), 'utf-8'))
    return `${source}\n${parts.join('\n')}`
  }
  if (filePath === 'src/shared/i18n.ts') {
    const locales = readdirSync(join(projectRoot, 'src/shared/i18n/locales'))
      .filter((name) => name.endsWith('.ts'))
      .sort()
      .map((name) => readFileSync(join(projectRoot, 'src/shared/i18n/locales', name), 'utf-8'))
    return `${source}\n${locales.join('\n')}`
  }
  return source
}

export const countMatches = (source: string, pattern: RegExp): number => source.match(pattern)?.length ?? 0

export const getNamedBody = (source: string, pattern: RegExp): string => source.match(pattern)?.groups?.body ?? ''

export const expectInOrder = (source: string, first: string, second: string): void => {
  const firstIndex = source.indexOf(first)
  expect(firstIndex).toBeGreaterThanOrEqual(0)
  expect(firstIndex).toBeLessThan(source.indexOf(second))
}
