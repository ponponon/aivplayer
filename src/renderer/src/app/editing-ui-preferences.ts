export const EDITING_UI_PREFERENCES_STORAGE_KEY = 'aivplayer.editing-ui-preferences.v1'
export const EDITING_UI_PREFERENCES_SCHEMA_VERSION = 1

const MAX_PROJECT_PREFERENCES = 32
const MAX_GROUP_PREFERENCES = 32
const MAX_ID_LENGTH = 256

export type EditingUiProjectPreferences = {
  detailsOpen: boolean
  openGroups: Record<string, boolean>
}

export type EditingUiPreferences = {
  schemaVersion: typeof EDITING_UI_PREFERENCES_SCHEMA_VERSION
  projects: Record<string, EditingUiProjectPreferences>
}

export type EditingUiPreferenceStorage = Pick<Storage, 'getItem' | 'setItem'>

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function sanitizeOpenGroups(value: unknown): Record<string, boolean> {
  if (!isRecord(value)) return {}
  const groups: Record<string, boolean> = {}
  for (const [id, open] of Object.entries(value)) {
    if (Object.keys(groups).length >= MAX_GROUP_PREFERENCES) break
    if (id.length > 0 && id.length <= MAX_ID_LENGTH && typeof open === 'boolean') groups[id] = open
  }
  return groups
}

function sanitizeProjectPreferences(value: unknown): EditingUiProjectPreferences {
  const project = isRecord(value) ? value : {}
  return {
    detailsOpen: typeof project.detailsOpen === 'boolean' ? project.detailsOpen : false,
    openGroups: sanitizeOpenGroups(project.openGroups)
  }
}

export function createDefaultEditingUiPreferences(): EditingUiPreferences {
  return { schemaVersion: EDITING_UI_PREFERENCES_SCHEMA_VERSION, projects: {} }
}

export function parseEditingUiPreferences(raw: string | null): EditingUiPreferences {
  if (!raw) return createDefaultEditingUiPreferences()
  try {
    const parsed: unknown = JSON.parse(raw)
    if (!isRecord(parsed) || parsed.schemaVersion !== EDITING_UI_PREFERENCES_SCHEMA_VERSION || !isRecord(parsed.projects)) return createDefaultEditingUiPreferences()
    const projects = Object.fromEntries(
      Object.entries(parsed.projects)
        .filter(([id]) => id.length > 0 && id.length <= MAX_ID_LENGTH)
        .slice(0, MAX_PROJECT_PREFERENCES)
        .map(([id, value]) => [id, sanitizeProjectPreferences(value)])
    )
    return { schemaVersion: EDITING_UI_PREFERENCES_SCHEMA_VERSION, projects }
  } catch {
    return createDefaultEditingUiPreferences()
  }
}

export function serializeEditingUiPreferences(preferences: EditingUiPreferences): string {
  return JSON.stringify(parseEditingUiPreferences(JSON.stringify(preferences)))
}

export function readEditingUiProjectPreferences(storage: EditingUiPreferenceStorage, projectId: string): EditingUiProjectPreferences | null {
  if (!projectId || projectId.length > MAX_ID_LENGTH) return null
  try {
    return parseEditingUiPreferences(storage.getItem(EDITING_UI_PREFERENCES_STORAGE_KEY)).projects[projectId] ?? null
  } catch {
    return null
  }
}

export function writeEditingUiProjectPreferences(storage: EditingUiPreferenceStorage, projectId: string, preferences: EditingUiProjectPreferences): void {
  if (!projectId || projectId.length > MAX_ID_LENGTH) return
  try {
    const current = parseEditingUiPreferences(storage.getItem(EDITING_UI_PREFERENCES_STORAGE_KEY))
    const projects = Object.fromEntries([
      ...Object.entries(current.projects).filter(([id]) => id !== projectId),
      [projectId, sanitizeProjectPreferences(preferences)]
    ].slice(-MAX_PROJECT_PREFERENCES))
    storage.setItem(EDITING_UI_PREFERENCES_STORAGE_KEY, serializeEditingUiPreferences({ schemaVersion: EDITING_UI_PREFERENCES_SCHEMA_VERSION, projects }))
  } catch {
    // Renderer storage can be disabled or full; the in-memory preference remains authoritative for this session.
  }
}
