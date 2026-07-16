import { readdir, readFile } from 'node:fs/promises'
import { extname, join, relative } from 'node:path'

const root = 'src'
const violations: Array<{ file: string; lines: number; max: number; rule: string }> = []

async function visit(directory: string): Promise<void> {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name)
    if (entry.isDirectory()) await visit(path)
    else await checkFile(path)
  }
}

async function checkFile(path: string): Promise<void> {
  const extension = extname(path)
  const name = path.split('/').pop() ?? path
  let rule: { max: number; name: string } | null = null
  if (['.tsx', '.jsx', '.vue'].includes(extension)) rule = { max: 200, name: 'UI component' }
  else if (['.css', '.scss'].includes(extension)) rule = { max: 150, name: 'style' }
  else if (/^use-[^/]+\.ts$/.test(name)) rule = { max: 150, name: 'hook' }
  else if (/(^|-)types\.ts$/.test(name)) rule = { max: 200, name: 'types' }
  else if (/(^|-)utils?\.ts$/.test(name)) rule = { max: 120, name: 'utility' }
  else if (/(^|-)services?\.ts$/.test(name) || path.includes('/services/')) rule = { max: 300, name: 'service' }
  if (!rule) return
  const content = await readFile(path, 'utf8')
  const lines = content.split(/\r?\n/).length - (content.endsWith('\n') ? 1 : 0)
  if (lines > rule.max) violations.push({ file: relative('.', path), lines, max: rule.max, rule: rule.name })
}

await visit(root)

if (violations.length > 0) {
  for (const violation of violations.sort((left, right) => right.lines - left.lines)) console.error(`${violation.file}: ${violation.lines} lines (max ${violation.max}, ${violation.rule})`)
  process.exitCode = 1
} else console.log('File-size limits passed.')
