import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

describe('person matte IPC surface', () => {
  it('registers model status, download and progress channels', () => {
    const projectRoot = process.cwd()
    const desktopSource = readFileSync(join(projectRoot, 'src/desktop/ipc-person-matte.ts'), 'utf8')
    const preloadSource = readFileSync(join(projectRoot, 'src/preload/index.ts'), 'utf8')

    expect(desktopSource).toContain('PERSON_MATTE_STATUS')
    expect(desktopSource).toContain('PERSON_MATTE_DOWNLOAD')
    expect(desktopSource).toContain('PERSON_MATTE_DOWNLOAD_PROGRESS')
    expect(preloadSource).toContain('getPersonMatteModelStatus')
    expect(preloadSource).toContain('downloadPersonMatteModel')
    expect(preloadSource).toContain('onPersonMatteModelDownloadProgress')
  })
})
