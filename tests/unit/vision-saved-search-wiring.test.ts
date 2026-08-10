import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const projectRoot = process.cwd()

describe('vision saved search wiring', () => {
  it('keeps the saved search IPC surface connected end to end', () => {
    const channels = readFileSync(join(projectRoot, 'src/shared/ipc-channels.ts'), 'utf8')
    const state = readFileSync(join(projectRoot, 'src/desktop/desktop-state.ts'), 'utf8')
    const services = readFileSync(join(projectRoot, 'src/desktop/desktop-services.ts'), 'utf8')
    const ipc = readFileSync(join(projectRoot, 'src/desktop/ipc-vision.ts'), 'utf8')
    const preload = readFileSync(join(projectRoot, 'src/preload/index.ts'), 'utf8')

    expect(channels).toContain("VISION_SAVED_SEARCH_LIST: 'vision:saved-search-list'")
    expect(channels).toContain("VISION_SAVED_SEARCH_SAVE: 'vision:saved-search-save'")
    expect(channels).toContain("VISION_SAVED_SEARCH_DELETE: 'vision:saved-search-delete'")
    expect(state).toContain('visionSavedSearchStore: VisionSavedSearchStore | null')
    expect(services).toContain('getVisionSavedSearchStore')
    expect(services).toContain('new VisionSavedSearchStore(app.getPath(\'userData\'))')
    expect(ipc).toContain('VISION_SAVED_SEARCH_LIST')
    expect(ipc).toContain('VISION_SAVED_SEARCH_SAVE')
    expect(ipc).toContain('VISION_SAVED_SEARCH_DELETE')
    expect(preload).toContain('listVisionSavedSearches')
    expect(preload).toContain('saveVisionSavedSearch')
    expect(preload).toContain('deleteVisionSavedSearch')
  })
})
