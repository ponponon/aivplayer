import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'

const CJK_PATTERN = /[\u3000-\u303f\u3040-\u30ff\u3400-\u4dbf\u4e00-\u9fff\ua960-\ua97f\uac00-\ud7ff\uf900-\ufaff]/u

function readOptions(argv) {
  const options = {}
  for (let index = 0; index < argv.length; index += 1) {
    const item = argv[index]
    const value = argv[index + 1]
    if (item === '--file' && value && !value.startsWith('--')) {
      options.file = value
      index += 1
    }
  }
  return options
}

export function assertEnglishReleaseNotes(content, filePath = 'release-notes.md') {
  const violations = []

  for (const [index, line] of content.split(/\r?\n/u).entries()) {
    if (CJK_PATTERN.test(line)) violations.push({ line: index + 1, text: line.trim() })
  }

  if (violations.length > 0) {
    const details = violations.map(({ line, text }) => `line ${line}: ${text}`).join('\n')
    throw new Error(`Release notes must use one English body; CJK text found in ${filePath}:\n${details}`)
  }

  return { ok: true, filePath }
}

export async function checkReleaseNotesLanguage(options = {}) {
  const filePath = resolve(options.file ?? 'release-notes.md')
  const content = await readFile(filePath, 'utf8')
  return assertEnglishReleaseNotes(content, filePath)
}

async function main() {
  const result = await checkReleaseNotesLanguage(readOptions(process.argv.slice(2)))
  console.log(`Release notes language verified: ${result.filePath}`)
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  void main().catch((error) => {
    console.error(error instanceof Error ? error.message : error)
    process.exitCode = 1
  })
}
