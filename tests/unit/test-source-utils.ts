import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { expect } from 'vitest'

const projectRoot = process.cwd()

export const readSource = (filePath: string): string => readFileSync(join(projectRoot, filePath), 'utf-8')

export const countMatches = (source: string, pattern: RegExp): number => source.match(pattern)?.length ?? 0

export const getNamedBody = (source: string, pattern: RegExp): string => source.match(pattern)?.groups?.body ?? ''

export const expectInOrder = (source: string, first: string, second: string): void => {
  const firstIndex = source.indexOf(first)
  expect(firstIndex).toBeGreaterThanOrEqual(0)
  expect(firstIndex).toBeLessThan(source.indexOf(second))
}
