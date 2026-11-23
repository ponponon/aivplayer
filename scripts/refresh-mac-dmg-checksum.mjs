import { createHash } from 'node:crypto'
import { createReadStream } from 'node:fs'
import { readFile, rename, stat, writeFile } from 'node:fs/promises'
import { basename, dirname, join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'

/**
 * electron-builder writes latest-mac.yml while packaging, before the DMG has been
 * notarized. `xcrun stapler staple` appends the ticket to the disk image, which
 * changes both its bytes and its length, so the sha512/size recorded in the
 * update metadata no longer describes the file users download. Squirrel only
 * consumes the ZIP entry, but the DMG entry is what the download page and any
 * checksum verification compare against, so it has to be rewritten in place.
 */

function readOptions(argv) {
  const options = {}
  for (let index = 0; index < argv.length; index += 1) {
    const item = argv[index]
    const value = argv[index + 1]
    if (!value || value.startsWith('--')) continue
    if (item === '--metadata') options.metadataPath = value
    else if (item === '--dmg') options.dmgPath = value
    else continue
    index += 1
  }
  return options
}

export async function sha512FileBase64(path) {
  const hash = createHash('sha512')
  for await (const chunk of createReadStream(path)) hash.update(chunk)
  return hash.digest('base64')
}

function urlBasename(line) {
  const value = line?.match(/url:\s*(.+?)\s*$/)?.[1]
  if (!value) return ''
  const withoutQuery = value.replace(/[?#].*$/, '')
  try {
    return basename(decodeURIComponent(withoutQuery))
  } catch {
    return basename(withoutQuery)
  }
}

function splitEntries(lines, filesIndex) {
  const entries = []
  let current = null
  for (let index = filesIndex + 1; index < lines.length; index += 1) {
    const line = lines[index]
    if (line && !/^\s/.test(line)) break
    if (/^\s+- /.test(line)) {
      current = { start: index, end: index, lines: [line] }
      entries.push(current)
      continue
    }
    if (!current) continue
    if (!line.trim()) break
    current.end = index
    current.lines.push(line)
  }
  return entries
}

function replaceEntryValue(lines, entry, key, value) {
  for (let index = entry.start; index <= entry.end; index += 1) {
    const pattern = new RegExp(`^(\\s+)${key}:\\s*.*$`)
    if (!pattern.test(lines[index])) continue
    const indent = lines[index].match(pattern)[1]
    lines[index] = `${indent}${key}: ${value}`
    return true
  }
  return false
}

export async function refreshMacDmgChecksum({ metadataPath, dmgPath }) {
  if (!metadataPath) throw new Error('Update metadata path is required (--metadata).')
  if (!dmgPath) throw new Error('Disk image path is required (--dmg).')

  const resolvedMetadata = resolve(metadataPath)
  const resolvedDmg = resolve(dmgPath)
  const content = await readFile(resolvedMetadata, 'utf8')
  const lines = content.split(/\r?\n/)
  const filesIndex = lines.findIndex((line) => line.trim() === 'files:')
  if (filesIndex < 0) throw new Error(`Update metadata has no files section: ${resolvedMetadata}`)

  const target = basename(resolvedDmg)
  const entry = splitEntries(lines, filesIndex).find((candidate) => urlBasename(candidate.lines[0]) === target)
  if (!entry) {
    // Nothing recorded for this disk image, so nothing can go stale.
    return { metadataPath: resolvedMetadata, dmgPath: resolvedDmg, updated: false, reason: 'not-listed' }
  }

  const previousSha512 = entry.lines.find((line) => /sha512:/.test(line))?.split('sha512:')[1]?.trim() ?? ''
  const sha512 = await sha512FileBase64(resolvedDmg)
  const size = (await stat(resolvedDmg)).size
  if (previousSha512 === sha512) {
    return { metadataPath: resolvedMetadata, dmgPath: resolvedDmg, updated: false, reason: 'unchanged', sha512 }
  }

  const updated = replaceEntryValue(lines, entry, 'sha512', sha512)
    && replaceEntryValue(lines, entry, 'size', String(size))
  if (!updated) throw new Error(`Update metadata entry is missing sha512 or size: ${target}`)

  const temporaryPath = join(dirname(resolvedMetadata), `.${target}.${process.pid}.tmp`)
  await writeFile(temporaryPath, lines.join('\n'), 'utf8')
  await rename(temporaryPath, resolvedMetadata)
  return { metadataPath: resolvedMetadata, dmgPath: resolvedDmg, updated: true, sha512, size }
}

async function main() {
  const result = await refreshMacDmgChecksum(readOptions(process.argv.slice(2)))
  if (result.updated) {
    console.log(`Disk image checksum refreshed in update metadata: ${basename(result.dmgPath)} (${result.size} bytes)`)
  } else {
    console.log(`Disk image checksum left unchanged (${result.reason}): ${basename(result.dmgPath)}`)
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  void main().catch((error) => {
    console.error(error instanceof Error ? error.message : error)
    process.exitCode = 1
  })
}
