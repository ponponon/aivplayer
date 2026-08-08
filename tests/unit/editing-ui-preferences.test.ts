import { describe, expect, it } from 'vitest'
import { EDITING_UI_PREFERENCES_SCHEMA_VERSION, EDITING_UI_PREFERENCES_STORAGE_KEY, parseEditingUiPreferences, pruneEditingUiPreferences, readEditingProjectIds, readEditingUiProjectPreferences, resetAllEditingUiPreferences, resetEditingUiProjectPreferences, writeEditingUiProjectPreferences } from '../../src/renderer/src/app/editing-ui-preferences'

function createMemoryStorage(): { storage: Storage; getRaw: () => string | null } {
  const values = new Map<string, string>()
  const storage = {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => { values.set(key, value) }
  } as unknown as Storage
  return { storage, getRaw: () => values.get(EDITING_UI_PREFERENCES_STORAGE_KEY) ?? null }
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

  it('prunes preferences for projects absent from the local project index', () => {
    const { storage } = createMemoryStorage()
    storage.setItem('aivplayer.editing-projects.v1', JSON.stringify({ first: { id: 'project-a' }, invalid: { id: 42 } }))
    writeEditingUiProjectPreferences(storage, 'project-a', { detailsOpen: true, openGroups: {} })
    writeEditingUiProjectPreferences(storage, 'orphan-project', { detailsOpen: true, openGroups: {} })
    writeEditingUiProjectPreferences(storage, 'new-project', { detailsOpen: true, openGroups: {} })

    expect(readEditingProjectIds(storage)).toEqual(['project-a'])
    expect(pruneEditingUiPreferences(storage, [...readEditingProjectIds(storage), 'new-project'])).toBe(1)
    expect(readEditingUiProjectPreferences(storage, 'project-a')).not.toBeNull()
    expect(readEditingUiProjectPreferences(storage, 'new-project')).not.toBeNull()
    expect(readEditingUiProjectPreferences(storage, 'orphan-project')).toBeNull()
  })

  it('resets only the requested project while preserving other project preferences', () => {
    const { storage } = createMemoryStorage()
    writeEditingUiProjectPreferences(storage, 'project-a', { detailsOpen: true, openGroups: { source: true } })
    writeEditingUiProjectPreferences(storage, 'project-b', { detailsOpen: true, openGroups: { translation: true } })

    expect(resetEditingUiProjectPreferences(storage, 'project-a')).toBe(true)
    expect(readEditingUiProjectPreferences(storage, 'project-a')).toBeNull()
    expect(readEditingUiProjectPreferences(storage, 'project-b')).toEqual({ detailsOpen: true, openGroups: { translation: true } })
    expect(resetEditingUiProjectPreferences(storage, 'project-a')).toBe(false)
  })

  it('resets every project preference and leaves an empty versioned store', () => {
    const { storage } = createMemoryStorage()
    writeEditingUiProjectPreferences(storage, 'project-a', { detailsOpen: true, openGroups: { source: true } })
    writeEditingUiProjectPreferences(storage, 'project-b', { detailsOpen: true, openGroups: { translation: true } })

    expect(resetAllEditingUiPreferences(storage)).toBe(2)
    expect(parseEditingUiPreferences(storage.getItem(EDITING_UI_PREFERENCES_STORAGE_KEY)).projects).toEqual({})
    expect(resetAllEditingUiPreferences(storage)).toBe(0)
  })

  it('does not throw when renderer storage is unavailable', () => {
    const brokenStorage = {
      getItem: () => { throw new Error('storage unavailable') },
      setItem: () => { throw new Error('storage unavailable') }
    } as unknown as Storage

    expect(readEditingUiProjectPreferences(brokenStorage, 'project-a')).toBeNull()
    expect(() => writeEditingUiProjectPreferences(brokenStorage, 'project-a', { detailsOpen: true, openGroups: {} })).not.toThrow()
    expect(() => pruneEditingUiPreferences(brokenStorage, ['project-a'])).not.toThrow()
    expect(resetEditingUiProjectPreferences(brokenStorage, 'project-a')).toBe(false)
    expect(resetAllEditingUiPreferences(brokenStorage)).toBe(0)
  })
})
