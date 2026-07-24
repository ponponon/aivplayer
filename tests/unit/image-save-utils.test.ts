import { access, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { findAvailableImagePath, sanitizeImageExtension, sanitizeImageFileName } from '../../src/core/image-save-utils'

let temporaryDirectory: string | null = null

afterEach(async () => {
  if (temporaryDirectory) await rm(temporaryDirectory, { recursive: true, force: true })
  temporaryDirectory = null
})

describe('image save utilities', () => {
  it('sanitizes extensions and keeps the fallback name safe', () => {
    expect(sanitizeImageExtension(' PNG/../../ ')).toBe('png')
    expect(sanitizeImageFileName('bad/name?.png', 'png')).toBe('name_.png')
    expect(sanitizeImageFileName('', 'webp')).toBe('aivplayer-image.webp')
  })

  it('allocates a non-colliding path for repeated batch exports', async () => {
    temporaryDirectory = await mkdtemp(join(tmpdir(), 'aivplayer-image-save-utils-'))
    await writeFile(join(temporaryDirectory, 'photo.png'), 'first')
    await writeFile(join(temporaryDirectory, 'photo-2.png'), 'second')

    const nextPath = await findAvailableImagePath(temporaryDirectory, 'photo.png')
    expect(nextPath).toBe(join(temporaryDirectory, 'photo-3.png'))
    await access(join(temporaryDirectory, 'photo.png'))
    await access(join(temporaryDirectory, 'photo-2.png'))
  })
})
