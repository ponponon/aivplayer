import { mkdtemp, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { describe, expect, it, vi } from 'vitest'

vi.mock('electron', () => ({
  shell: {
    openPath: vi.fn(async () => '')
  }
}))

import { openPathInDefaultApp } from '../../src/desktop/system/file-actions'

describe('file actions', () => {
  it('opens an existing path in the default app', async () => {
    const opener = {
      openPath: vi.fn(async (filePath: string) => {
        expect(filePath).toBeTruthy()
        return ''
      })
    }
    const cacheDirectory = await mkdtemp(join(tmpdir(), 'aivplayer-open-path-'))
    const filePath = join(cacheDirectory, 'subtitle.srt')
    await writeFile(filePath, 'WEBVTT')

    await expect(openPathInDefaultApp(filePath, opener)).resolves.toBe(true)
    expect(opener.openPath).toHaveBeenCalledWith(filePath)
  })

  it('does not open a missing path', async () => {
    const opener = {
      openPath: vi.fn(async () => '')
    }

    await expect(openPathInDefaultApp('/path/does/not/exist.srt', opener)).resolves.toBe(false)
    expect(opener.openPath).not.toHaveBeenCalled()
  })

  it('returns false when the default app reports an error', async () => {
    const opener = {
      openPath: vi.fn(async () => 'failed to open')
    }
    const cacheDirectory = await mkdtemp(join(tmpdir(), 'aivplayer-open-path-error-'))
    const filePath = join(cacheDirectory, 'subtitle.srt')
    await writeFile(filePath, 'WEBVTT')

    await expect(openPathInDefaultApp(filePath, opener)).resolves.toBe(false)
    expect(opener.openPath).toHaveBeenCalledWith(filePath)
  })
})
