import { createHash } from 'node:crypto'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { describe, expect, it } from 'vitest'
import { createMediaContentHash, normalizeMediaContentHash } from '../../src/core/media/media-content-hash'

describe('media content hash', () => {
  it('hashes a file as a stream and returns the SHA-256 digest', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'aivplayer-content-hash-'))
    try {
      const filePath = join(directory, 'sample.mp4')
      const content = Buffer.from('aivplayer-content-hash-regression')
      await writeFile(filePath, content)

      expect(await createMediaContentHash(filePath)).toBe(createHash('sha256').update(content).digest('hex'))
    } finally {
      await rm(directory, { recursive: true, force: true })
    }
  })

  it('normalizes only complete hexadecimal SHA-256 values', () => {
    const hash = 'A'.repeat(64)
    expect(normalizeMediaContentHash(` ${hash} `)).toBe('a'.repeat(64))
    expect(normalizeMediaContentHash('not-a-hash')).toBeUndefined()
    expect(normalizeMediaContentHash('a'.repeat(63))).toBeUndefined()
  })
})
