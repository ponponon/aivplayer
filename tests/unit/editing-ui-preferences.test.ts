import { describe, expect, it } from 'vitest'
import { EDITING_UI_PREFERENCES_SCHEMA_VERSION, EDITING_UI_PREFERENCES_STORAGE_KEY, parseEditingUiPreferences, readEditingUiProjectPreferences, writeEditingUiProjectPreferences } from '../../src/renderer/src/app/editing-ui-preferences'

function createMemoryStorage(): { storage: Storage; getRaw: () => string | null } {
  let raw: string | null = null
  const storage = {
    getItem: () => raw,
    setItem: (_key: string, value: string) => { raw = value }
  } as unknown as Storage
  return { storage, getRaw: () => raw }
}

describe('editing UI preferences', () => {
  it('rejects malformed and unsupported versions while sanitizing boolean state', () => {
    expect(parseEditingUiPreferences('{broken').schemaVersion).toBe(EDITING_UI_PREFERENCES_SCHEMA_VERSION)
    expect(parseEditingUiPreferences(JSON.stringify({ schemaVersion: 99, projects: {} })).projects).toEqual({})
    expect(parseEditingUiPreferences(JSON.stringify({
      schemaVersion: EDITING_UI_PREFERENCES_SCHEMA_VERSION,
      projects: { demo: { detailsOpen: true, openGroups: { source: true, translation: 'yes', '': true } } }
    })).projects).toEqual({ demo: { detailsOpen: true, openGroups: { source: true } } })
  })

  it('round-trips project-scoped state through the versioned storage key', () => {
    const { storage, getRaw } = createMemoryStorage()
    writeEditingUiProjectPreferences(storage, 'project-a', { detailsOpen: true, openGroups: { source: true } })
    writeEditingUiProjectPreferences(storage, 'project-b', { detailsOpen: false, openGroups: { translation: true } })

    expect(readEditingUiProjectPreferences(storage, 'project-a')).toEqual({ detailsOpen: true, openGroups: { source: true } })
    expect(readEditingUiProjectPreferences(storage, 'project-b')).toEqual({ detailsOpen: false, openGroups: { translation: true } })
    expect(getRaw()).toContain(`"schemaVersion":${EDITING_UI_PREFERENCES_SCHEMA_VERSION}`)
    expect(getRaw()).not.toContain('/old-machine/')
  })

  it('keeps the newest project entries within the bounded preference set', () => {
    const { storage } = createMemoryStorage()
    for (let index = 0; index < 40; index += 1) {
      writeEditingUiProjectPreferences(storage, `project-${index}`, { detailsOpen: index % 2 === 0, openGroups: {} })
    }

    const parsed = parseEditingUiPreferences(storage.getItem(EDITING_UI_PREFERENCES_STORAGE_KEY))
    expect(Object.keys(parsed.projects)).toHaveLength(32)
    expect(parsed.projects['project-0']).toBeUndefined()
    expect(parsed.projects['project-39']).toBeDefined()
  })

  it('does not throw when renderer storage is unavailable', () => {
    const brokenStorage = {
      getItem: () => { throw new Error('storage unavailable') },
      setItem: () => { throw new Error('storage unavailable') }
    } as unknown as Storage

    expect(readEditingUiProjectPreferences(brokenStorage, 'project-a')).toBeNull()
    expect(() => writeEditingUiProjectPreferences(brokenStorage, 'project-a', { detailsOpen: true, openGroups: {} })).not.toThrow()
  })
})
