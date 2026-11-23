import { createHash } from 'node:crypto'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
// @ts-expect-error - release tooling is plain ESM without type declarations
import { refreshMacDmgChecksum, sha512FileBase64 } from '../../scripts/refresh-mac-dmg-checksum.mjs'

const temporaryDirectories: string[] = []

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })))
})

async function createWorkspace(metadataLines: string[], dmgContent: string) {
  const directory = await mkdtemp(join(tmpdir(), 'aivplayer-dmg-metadata-'))
  temporaryDirectories.push(directory)
  const metadataPath = join(directory, 'latest-mac.yml')
  const dmgPath = join(directory, 'AIVPlayer-0.6.14-arm64.dmg')
  await writeFile(metadataPath, metadataLines.join('\n'), 'utf8')
  await writeFile(dmgPath, dmgContent, 'utf8')
  return { directory, metadataPath, dmgPath }
}

const metadataWithDmg = (sha512: string, size: number) => [
  'version: 0.6.14',
  'files:',
  '  - url: AIVPlayer-0.6.14-arm64-mac.zip',
  '    sha512: zip-sha512',
  '    size: 111',
  '  - url: AIVPlayer-0.6.14-arm64.dmg',
  `    sha512: ${sha512}`,
  `    size: ${size}`,
  'path: AIVPlayer-0.6.14-arm64-mac.zip',
  'sha512: zip-sha512',
  "releaseDate: '2026-11-24T00:00:00.000Z'",
  ''
]

describe('refresh-mac-dmg-checksum', () => {
  it('hashing the stapled image yields the base64 sha512 of its bytes', async () => {
    const workspace = await createWorkspace(metadataWithDmg('stale', 1), 'stapled-image')
    const expected = createHash('sha512').update('stapled-image').digest('base64')
    await expect(sha512FileBase64(workspace.dmgPath)).resolves.toBe(expected)
  })

  it('rewrites the disk image entry without touching the zip entry', async () => {
    const workspace = await createWorkspace(metadataWithDmg('stale-ticket-sha512', 8), 'stapled-image')
    const result = await refreshMacDmgChecksum(workspace)

    expect(result.updated).toBe(true)
    const content = await readFile(workspace.metadataPath, 'utf8')
    expect(content).toContain('sha512: zip-sha512')
    expect(content).toContain('size: 111')
    expect(content).not.toContain('stale-ticket-sha512')
    expect(content).toContain(`sha512: ${createHash('sha512').update('stapled-image').digest('base64')}`)
    expect(content).toContain('size: 13')
    // The primary update payload must keep pointing at the zip.
    expect(content).toContain('path: AIVPlayer-0.6.14-arm64-mac.zip')
  })

  it('leaves metadata untouched once the recorded checksum already matches', async () => {
    const sha512 = createHash('sha512').update('stapled-image').digest('base64')
    const workspace = await createWorkspace(metadataWithDmg(sha512, 13), 'stapled-image')
    const before = await readFile(workspace.metadataPath, 'utf8')

    const result = await refreshMacDmgChecksum(workspace)

    expect(result).toMatchObject({ updated: false, reason: 'unchanged' })
    await expect(readFile(workspace.metadataPath, 'utf8')).resolves.toBe(before)
  })

  it('reports a no-op when the disk image is not listed in the update metadata', async () => {
    const workspace = await createWorkspace([
      'version: 0.6.14',
      'files:',
      '  - url: AIVPlayer-0.6.14-arm64-mac.zip',
      '    sha512: zip-sha512',
      '    size: 111',
      'path: AIVPlayer-0.6.14-arm64-mac.zip',
      ''
    ], 'stapled-image')

    const result = await refreshMacDmgChecksum(workspace)

    expect(result).toMatchObject({ updated: false, reason: 'not-listed' })
  })

  it('rejects metadata that has no files section', async () => {
    const workspace = await createWorkspace(['version: 0.6.14', 'path: AIVPlayer-0.6.14-arm64-mac.zip', ''], 'stapled-image')
    await expect(refreshMacDmgChecksum(workspace)).rejects.toThrow(/has no files section/)
  })
})
