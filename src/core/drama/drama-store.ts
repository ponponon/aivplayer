import { DatabaseSync } from 'node:sqlite'
import { mkdirSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { randomUUID } from 'node:crypto'
import type {
  DramaChapter,
  DramaChapterEvent,
  DramaCreateProjectInput,
  DramaAsset,
  DramaAssetInput,
  DramaImportChapterInput,
  DramaPlan,
  DramaProject,
  DramaScript,
  DramaStoryboard,
  DramaStoryboardInput,
  DramaTask,
  DramaTaskStatus
} from '../../shared/drama-types'

type SqliteRow = Record<string, unknown>

export function getDramaDatabasePath(userDataPath: string): string {
  return join(userDataPath, 'drama', 'drama.sqlite')
}

function stringValue(row: SqliteRow, key: string, fallback = ''): string {
  return typeof row[key] === 'string' ? row[key] as string : fallback
}

function numberValue(row: SqliteRow, key: string, fallback = 0): number {
  return typeof row[key] === 'number' ? row[key] as number : fallback
}

function parseEvent(value: unknown): DramaChapterEvent | undefined {
  if (typeof value !== 'string' || !value.trim()) return undefined
  try {
    const parsed = JSON.parse(value) as Partial<DramaChapterEvent>
    if (typeof parsed.summary !== 'string' || typeof parsed.conflict !== 'string' || typeof parsed.hook !== 'string') return undefined
    return {
      summary: parsed.summary,
      characters: Array.isArray(parsed.characters) ? parsed.characters.filter((item): item is string => typeof item === 'string') : [],
      locations: Array.isArray(parsed.locations) ? parsed.locations.filter((item): item is string => typeof item === 'string') : [],
      conflict: parsed.conflict,
      hook: parsed.hook
    }
  } catch {
    return undefined
  }
}

function parseStringArray(value: unknown): string[] {
  if (typeof value !== 'string' || !value.trim()) return []
  try {
    const parsed = JSON.parse(value) as unknown
    return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === 'string' && Boolean(item.trim())).map((item) => item.trim()) : []
  } catch {
    return []
  }
}

export class DramaStore {
  readonly databasePath: string
  private readonly database: DatabaseSync

  constructor(userDataPath: string) {
    this.databasePath = resolve(getDramaDatabasePath(userDataPath))
    mkdirSync(dirname(this.databasePath), { recursive: true })
    this.database = new DatabaseSync(this.databasePath)
    this.database.exec('PRAGMA foreign_keys = ON')
    this.database.exec(`
      CREATE TABLE IF NOT EXISTS drama_projects (
        id TEXT PRIMARY KEY,
        title TEXT NOT NULL,
        intro TEXT NOT NULL DEFAULT '',
        genre TEXT NOT NULL DEFAULT '',
        episode_count INTEGER NOT NULL DEFAULT 20,
        episode_duration_seconds INTEGER NOT NULL DEFAULT 60,
        status TEXT NOT NULL DEFAULT 'draft',
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      );
      CREATE TABLE IF NOT EXISTS drama_chapters (
        id TEXT PRIMARY KEY,
        project_id TEXT NOT NULL REFERENCES drama_projects(id) ON DELETE CASCADE,
        chapter_index INTEGER NOT NULL,
        volume TEXT NOT NULL DEFAULT '',
        title TEXT NOT NULL,
        content TEXT NOT NULL,
        event_json TEXT,
        event_status TEXT NOT NULL DEFAULT 'pending',
        event_error TEXT,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL,
        UNIQUE(project_id, chapter_index)
      );
      CREATE TABLE IF NOT EXISTS drama_plans (
        project_id TEXT PRIMARY KEY REFERENCES drama_projects(id) ON DELETE CASCADE,
        story_skeleton TEXT NOT NULL DEFAULT '',
        adaptation_strategy TEXT NOT NULL DEFAULT '',
        updated_at INTEGER NOT NULL
      );
      CREATE TABLE IF NOT EXISTS drama_scripts (
        id TEXT PRIMARY KEY,
        project_id TEXT NOT NULL REFERENCES drama_projects(id) ON DELETE CASCADE,
        episode_index INTEGER NOT NULL,
        title TEXT NOT NULL,
        content TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'draft',
        error TEXT,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL,
        UNIQUE(project_id, episode_index)
      );
      CREATE TABLE IF NOT EXISTS drama_assets (
        id TEXT PRIMARY KEY,
        project_id TEXT NOT NULL REFERENCES drama_projects(id) ON DELETE CASCADE,
        asset_type TEXT NOT NULL,
        name TEXT NOT NULL,
        description TEXT NOT NULL DEFAULT '',
        visual_prompt TEXT NOT NULL DEFAULT '',
        status TEXT NOT NULL DEFAULT 'draft',
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL,
        UNIQUE(project_id, asset_type, name)
      );
      CREATE TABLE IF NOT EXISTS drama_storyboards (
        id TEXT PRIMARY KEY,
        project_id TEXT NOT NULL REFERENCES drama_projects(id) ON DELETE CASCADE,
        episode_index INTEGER NOT NULL,
        scene_index INTEGER NOT NULL,
        title TEXT NOT NULL,
        duration_seconds INTEGER NOT NULL DEFAULT 5,
        location TEXT NOT NULL DEFAULT '',
        characters_json TEXT NOT NULL DEFAULT '[]',
        action TEXT NOT NULL DEFAULT '',
        dialogue TEXT NOT NULL DEFAULT '',
        visual_prompt TEXT NOT NULL DEFAULT '',
        camera_prompt TEXT NOT NULL DEFAULT '',
        status TEXT NOT NULL DEFAULT 'draft',
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL,
        UNIQUE(project_id, episode_index, scene_index)
      );
      CREATE TABLE IF NOT EXISTS drama_tasks (
        id TEXT PRIMARY KEY,
        project_id TEXT NOT NULL REFERENCES drama_projects(id) ON DELETE CASCADE,
        stage TEXT NOT NULL,
        target_id TEXT,
        status TEXT NOT NULL,
        progress REAL NOT NULL DEFAULT 0,
        message TEXT NOT NULL DEFAULT '',
        error TEXT,
        started_at INTEGER NOT NULL,
        completed_at INTEGER
      );
      CREATE INDEX IF NOT EXISTS drama_chapters_project_index ON drama_chapters(project_id, chapter_index);
      CREATE INDEX IF NOT EXISTS drama_assets_project_type ON drama_assets(project_id, asset_type);
      CREATE INDEX IF NOT EXISTS drama_storyboards_project_episode ON drama_storyboards(project_id, episode_index, scene_index);
      CREATE INDEX IF NOT EXISTS drama_tasks_project_started ON drama_tasks(project_id, started_at DESC);
    `)
  }

  close(): void {
    this.database.close()
  }

  listProjects(): DramaProject[] {
    const rows = this.database.prepare('SELECT * FROM drama_projects ORDER BY updated_at DESC').all() as SqliteRow[]
    return rows.map((row) => this.toProject(row))
  }

  getProject(projectId: string): DramaProject | null {
    const row = this.database.prepare('SELECT * FROM drama_projects WHERE id = ?').get(projectId) as SqliteRow | undefined
    return row ? this.toProject(row) : null
  }

  createProject(input: DramaCreateProjectInput): DramaProject {
    const title = input.title.trim()
    if (!title) throw new Error('短剧项目名称不能为空')
    const now = Date.now()
    const project: DramaProject = {
      id: randomUUID(),
      title,
      intro: input.intro?.trim() ?? '',
      genre: input.genre?.trim() ?? '',
      episodeCount: normalizePositiveInteger(input.episodeCount, 20),
      episodeDurationSeconds: normalizePositiveInteger(input.episodeDurationSeconds, 60),
      status: 'draft',
      createdAt: now,
      updatedAt: now
    }
    this.database.prepare(`
      INSERT INTO drama_projects (id, title, intro, genre, episode_count, episode_duration_seconds, status, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(project.id, project.title, project.intro, project.genre, project.episodeCount, project.episodeDurationSeconds, project.status, now, now)
    return project
  }

  importChapters(projectId: string, chapters: DramaImportChapterInput[]): DramaChapter[] {
    this.requireProject(projectId)
    const imported: DramaChapter[] = []
    for (const chapter of chapters) {
      const title = chapter.title.trim() || `第${chapter.chapterIndex}章`
      const content = chapter.content.trim()
      if (!content) continue
      const existing = this.database.prepare('SELECT id, created_at FROM drama_chapters WHERE project_id = ? AND chapter_index = ?').get(projectId, chapter.chapterIndex) as SqliteRow | undefined
      const now = Date.now()
      const id = existing ? stringValue(existing, 'id') : randomUUID()
      this.database.prepare(`
        INSERT INTO drama_chapters (id, project_id, chapter_index, volume, title, content, event_json, event_status, event_error, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, NULL, 'pending', NULL, ?, ?)
        ON CONFLICT(project_id, chapter_index) DO UPDATE SET
          volume = excluded.volume,
          title = excluded.title,
          content = excluded.content,
          event_json = NULL,
          event_status = 'pending',
          event_error = NULL,
          updated_at = excluded.updated_at
      `).run(id, projectId, chapter.chapterIndex, chapter.volume?.trim() ?? '', title, content, existing ? numberValue(existing, 'created_at', now) : now, now)
      imported.push(this.getChapter(id) as DramaChapter)
    }
    this.touchProject(projectId)
    return imported
  }

  listChapters(projectId: string): DramaChapter[] {
    const rows = this.database.prepare('SELECT * FROM drama_chapters WHERE project_id = ? ORDER BY chapter_index ASC').all(projectId) as SqliteRow[]
    return rows.map((row) => this.toChapter(row))
  }

  getChapter(chapterId: string): DramaChapter | null {
    const row = this.database.prepare('SELECT * FROM drama_chapters WHERE id = ?').get(chapterId) as SqliteRow | undefined
    return row ? this.toChapter(row) : null
  }

  setChapterEvent(chapterId: string, status: DramaChapter['eventStatus'], event?: DramaChapterEvent, error?: string): DramaChapter {
    const chapter = this.getChapter(chapterId)
    if (!chapter) throw new Error(`章节不存在：${chapterId}`)
    this.database.prepare(`
      UPDATE drama_chapters SET event_json = ?, event_status = ?, event_error = ?, updated_at = ? WHERE id = ?
    `).run(event ? JSON.stringify(event) : null, status, error ?? null, Date.now(), chapterId)
    this.touchProject(chapter.projectId)
    return this.getChapter(chapterId) as DramaChapter
  }

  getPlan(projectId: string): DramaPlan | null {
    const row = this.database.prepare('SELECT * FROM drama_plans WHERE project_id = ?').get(projectId) as SqliteRow | undefined
    if (!row) return null
    return {
      projectId,
      storySkeleton: stringValue(row, 'story_skeleton'),
      adaptationStrategy: stringValue(row, 'adaptation_strategy'),
      updatedAt: numberValue(row, 'updated_at')
    }
  }

  savePlan(projectId: string, patch: Pick<DramaPlan, 'storySkeleton' | 'adaptationStrategy'>): DramaPlan {
    this.requireProject(projectId)
    const existing = this.getPlan(projectId)
    const plan: DramaPlan = {
      projectId,
      storySkeleton: patch.storySkeleton ?? existing?.storySkeleton ?? '',
      adaptationStrategy: patch.adaptationStrategy ?? existing?.adaptationStrategy ?? '',
      updatedAt: Date.now()
    }
    this.database.prepare(`
      INSERT INTO drama_plans (project_id, story_skeleton, adaptation_strategy, updated_at)
      VALUES (?, ?, ?, ?)
      ON CONFLICT(project_id) DO UPDATE SET
        story_skeleton = excluded.story_skeleton,
        adaptation_strategy = excluded.adaptation_strategy,
        updated_at = excluded.updated_at
    `).run(projectId, plan.storySkeleton, plan.adaptationStrategy, plan.updatedAt)
    this.touchProject(projectId)
    return plan
  }

  listScripts(projectId: string): DramaScript[] {
    const rows = this.database.prepare('SELECT * FROM drama_scripts WHERE project_id = ? ORDER BY episode_index ASC').all(projectId) as SqliteRow[]
    return rows.map((row) => this.toScript(row))
  }

  getScript(projectId: string, episodeIndex: number): DramaScript | null {
    const row = this.database.prepare('SELECT * FROM drama_scripts WHERE project_id = ? AND episode_index = ?').get(projectId, episodeIndex) as SqliteRow | undefined
    return row ? this.toScript(row) : null
  }

  saveScript(projectId: string, episodeIndex: number, title: string, content: string): DramaScript {
    this.requireProject(projectId)
    const existing = this.getScript(projectId, episodeIndex)
    const now = Date.now()
    const id = existing?.id ?? randomUUID()
    this.database.prepare(`
      INSERT INTO drama_scripts (id, project_id, episode_index, title, content, status, error, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, 'completed', NULL, ?, ?)
      ON CONFLICT(project_id, episode_index) DO UPDATE SET
        title = excluded.title,
        content = excluded.content,
        status = 'completed',
        error = NULL,
        updated_at = excluded.updated_at
    `).run(id, projectId, episodeIndex, title.trim() || `第${episodeIndex}集`, content.trim(), existing?.createdAt ?? now, now)
    this.touchProject(projectId)
    return this.getScript(projectId, episodeIndex) as DramaScript
  }

  listAssets(projectId: string): DramaAsset[] {
    const rows = this.database.prepare('SELECT * FROM drama_assets WHERE project_id = ? ORDER BY asset_type ASC, name ASC').all(projectId) as SqliteRow[]
    return rows.map((row) => this.toAsset(row))
  }

  replaceAssets(projectId: string, inputs: DramaAssetInput[]): DramaAsset[] {
    this.requireProject(projectId)
    const now = Date.now()
    this.database.exec('BEGIN')
    try {
      this.database.prepare('DELETE FROM drama_assets WHERE project_id = ?').run(projectId)
      for (const input of inputs) {
        const name = input.name.trim()
        if (!name) continue
        this.database.prepare(`
          INSERT INTO drama_assets (id, project_id, asset_type, name, description, visual_prompt, status, created_at, updated_at)
          VALUES (?, ?, ?, ?, ?, ?, 'draft', ?, ?)
        `).run(randomUUID(), projectId, input.assetType, name, input.description?.trim() ?? '', input.visualPrompt?.trim() ?? '', now, now)
      }
      this.database.exec('COMMIT')
    } catch (error) {
      this.database.exec('ROLLBACK')
      throw error
    }
    this.touchProject(projectId)
    return this.listAssets(projectId)
  }

  listStoryboards(projectId: string, episodeIndex?: number): DramaStoryboard[] {
    const query = episodeIndex == null
      ? 'SELECT * FROM drama_storyboards WHERE project_id = ? ORDER BY episode_index ASC, scene_index ASC'
      : 'SELECT * FROM drama_storyboards WHERE project_id = ? AND episode_index = ? ORDER BY scene_index ASC'
    const rows = (episodeIndex == null
      ? this.database.prepare(query).all(projectId)
      : this.database.prepare(query).all(projectId, episodeIndex)) as SqliteRow[]
    return rows.map((row) => this.toStoryboard(row))
  }

  replaceStoryboard(projectId: string, episodeIndex: number, inputs: DramaStoryboardInput[]): DramaStoryboard[] {
    this.requireProject(projectId)
    const now = Date.now()
    this.database.exec('BEGIN')
    try {
      this.database.prepare('DELETE FROM drama_storyboards WHERE project_id = ? AND episode_index = ?').run(projectId, episodeIndex)
      for (const input of inputs) {
        const title = input.title.trim() || `场景 ${input.sceneIndex}`
        this.database.prepare(`
          INSERT INTO drama_storyboards (id, project_id, episode_index, scene_index, title, duration_seconds, location, characters_json, action, dialogue, visual_prompt, camera_prompt, status, created_at, updated_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'draft', ?, ?)
        `).run(
          randomUUID(), projectId, episodeIndex, input.sceneIndex, title, normalizePositiveInteger(input.durationSeconds, 5), input.location?.trim() ?? '', JSON.stringify(input.characters ?? []), input.action?.trim() ?? '', input.dialogue?.trim() ?? '', input.visualPrompt?.trim() ?? '', input.cameraPrompt?.trim() ?? '', now, now
        )
      }
      this.database.exec('COMMIT')
    } catch (error) {
      this.database.exec('ROLLBACK')
      throw error
    }
    this.touchProject(projectId)
    return this.listStoryboards(projectId, episodeIndex)
  }

  startTask(projectId: string, stage: DramaTask['stage'], targetId: string | undefined, message: string): DramaTask {
    this.requireProject(projectId)
    const task: DramaTask = {
      id: randomUUID(),
      projectId,
      stage,
      targetId,
      status: 'running',
      progress: 0,
      message,
      startedAt: Date.now()
    }
    this.database.prepare(`
      INSERT INTO drama_tasks (id, project_id, stage, target_id, status, progress, message, started_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(task.id, task.projectId, task.stage, task.targetId ?? null, task.status, task.progress, task.message, task.startedAt)
    return task
  }

  updateTask(taskId: string, progress: number, message: string): DramaTask {
    this.database.prepare('UPDATE drama_tasks SET progress = ?, message = ? WHERE id = ?').run(Math.min(1, Math.max(0, progress)), message, taskId)
    return this.getTask(taskId) as DramaTask
  }

  finishTask(taskId: string, status: DramaTaskStatus, message: string, error?: string): DramaTask {
    this.database.prepare('UPDATE drama_tasks SET status = ?, progress = ?, message = ?, error = ?, completed_at = ? WHERE id = ?').run(status, status === 'completed' ? 1 : 0, message, error ?? null, Date.now(), taskId)
    return this.getTask(taskId) as DramaTask
  }

  getTask(taskId: string): DramaTask | null {
    const row = this.database.prepare('SELECT * FROM drama_tasks WHERE id = ?').get(taskId) as SqliteRow | undefined
    if (!row) return null
    return {
      id: stringValue(row, 'id'),
      projectId: stringValue(row, 'project_id'),
      stage: stringValue(row, 'stage') as DramaTask['stage'],
      targetId: typeof row.target_id === 'string' ? row.target_id : undefined,
      status: stringValue(row, 'status') as DramaTaskStatus,
      progress: numberValue(row, 'progress'),
      message: stringValue(row, 'message'),
      error: typeof row.error === 'string' ? row.error : undefined,
      startedAt: numberValue(row, 'started_at'),
      completedAt: typeof row.completed_at === 'number' ? row.completed_at : undefined
    }
  }

  private requireProject(projectId: string): DramaProject {
    const project = this.getProject(projectId)
    if (!project) throw new Error(`短剧项目不存在：${projectId}`)
    return project
  }

  private touchProject(projectId: string): void {
    this.database.prepare('UPDATE drama_projects SET updated_at = ? WHERE id = ?').run(Date.now(), projectId)
  }

  private toProject(row: SqliteRow): DramaProject {
    return {
      id: stringValue(row, 'id'),
      title: stringValue(row, 'title'),
      intro: stringValue(row, 'intro'),
      genre: stringValue(row, 'genre'),
      episodeCount: numberValue(row, 'episode_count', 20),
      episodeDurationSeconds: numberValue(row, 'episode_duration_seconds', 60),
      status: stringValue(row, 'status', 'draft') as DramaProject['status'],
      createdAt: numberValue(row, 'created_at'),
      updatedAt: numberValue(row, 'updated_at')
    }
  }

  private toChapter(row: SqliteRow): DramaChapter {
    return {
      id: stringValue(row, 'id'),
      projectId: stringValue(row, 'project_id'),
      chapterIndex: numberValue(row, 'chapter_index'),
      volume: stringValue(row, 'volume'),
      title: stringValue(row, 'title'),
      content: stringValue(row, 'content'),
      event: parseEvent(row.event_json),
      eventStatus: stringValue(row, 'event_status', 'pending') as DramaChapter['eventStatus'],
      eventError: typeof row.event_error === 'string' ? row.event_error : undefined,
      createdAt: numberValue(row, 'created_at'),
      updatedAt: numberValue(row, 'updated_at')
    }
  }

  private toScript(row: SqliteRow): DramaScript {
    return {
      id: stringValue(row, 'id'),
      projectId: stringValue(row, 'project_id'),
      episodeIndex: numberValue(row, 'episode_index'),
      title: stringValue(row, 'title'),
      content: stringValue(row, 'content'),
      status: stringValue(row, 'status', 'draft') as DramaScript['status'],
      error: typeof row.error === 'string' ? row.error : undefined,
      createdAt: numberValue(row, 'created_at'),
      updatedAt: numberValue(row, 'updated_at')
    }
  }

  private toAsset(row: SqliteRow): DramaAsset {
    return {
      id: stringValue(row, 'id'),
      projectId: stringValue(row, 'project_id'),
      assetType: stringValue(row, 'asset_type') as DramaAsset['assetType'],
      name: stringValue(row, 'name'),
      description: stringValue(row, 'description'),
      visualPrompt: stringValue(row, 'visual_prompt'),
      status: stringValue(row, 'status', 'draft') as DramaAsset['status'],
      createdAt: numberValue(row, 'created_at'),
      updatedAt: numberValue(row, 'updated_at')
    }
  }

  private toStoryboard(row: SqliteRow): DramaStoryboard {
    return {
      id: stringValue(row, 'id'),
      projectId: stringValue(row, 'project_id'),
      episodeIndex: numberValue(row, 'episode_index'),
      sceneIndex: numberValue(row, 'scene_index'),
      title: stringValue(row, 'title'),
      durationSeconds: numberValue(row, 'duration_seconds', 5),
      location: stringValue(row, 'location'),
      characters: parseStringArray(row.characters_json),
      action: stringValue(row, 'action'),
      dialogue: stringValue(row, 'dialogue'),
      visualPrompt: stringValue(row, 'visual_prompt'),
      cameraPrompt: stringValue(row, 'camera_prompt'),
      status: stringValue(row, 'status', 'draft') as DramaStoryboard['status'],
      createdAt: numberValue(row, 'created_at'),
      updatedAt: numberValue(row, 'updated_at')
    }
  }
}

function normalizePositiveInteger(value: number | undefined, fallback: number): number {
  return typeof value === 'number' && Number.isInteger(value) && value > 0 ? value : fallback
}
