import { DatabaseSync } from 'node:sqlite'
import { mkdirSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { randomUUID } from 'node:crypto'
import type {
  DramaChapter,
  DramaChapterEvent,
  DramaCreateProjectInput,
  DramaAsset,
  DramaAssetPatch,
  DramaAssetInput,
  DramaGenerationTask,
  DramaGenerationTaskInput,
  DramaGenerationTaskPatch,
  DramaGenerationTaskStatus,
  DramaGraphTemplate,
  DramaGraphTemplateInput,
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
      CREATE TABLE IF NOT EXISTS drama_generation_tasks (
        id TEXT PRIMARY KEY,
        project_id TEXT NOT NULL REFERENCES drama_projects(id) ON DELETE CASCADE,
        media_type TEXT NOT NULL,
        target_id TEXT,
        prompt TEXT NOT NULL,
        status TEXT NOT NULL,
        progress REAL NOT NULL DEFAULT 0,
        message TEXT NOT NULL DEFAULT '',
        provider_id TEXT NOT NULL DEFAULT 'unconfigured',
        model TEXT,
        parameters_json TEXT NOT NULL DEFAULT '{}',
        attempt INTEGER NOT NULL DEFAULT 0,
        max_attempts INTEGER NOT NULL DEFAULT 2,
        estimated_cost REAL,
        actual_cost REAL,
        error TEXT,
        result_path TEXT,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL DEFAULT 0,
        started_at INTEGER,
        completed_at INTEGER
      );
      CREATE TABLE IF NOT EXISTS drama_graph_templates (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL UNIQUE,
        description TEXT NOT NULL DEFAULT '',
        nodes_json TEXT NOT NULL DEFAULT '[]',
        edges_json TEXT NOT NULL DEFAULT '[]',
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      );
      CREATE INDEX IF NOT EXISTS drama_chapters_project_index ON drama_chapters(project_id, chapter_index);
      CREATE INDEX IF NOT EXISTS drama_assets_project_type ON drama_assets(project_id, asset_type);
      CREATE INDEX IF NOT EXISTS drama_storyboards_project_episode ON drama_storyboards(project_id, episode_index, scene_index);
      CREATE INDEX IF NOT EXISTS drama_tasks_project_started ON drama_tasks(project_id, started_at DESC);
      CREATE INDEX IF NOT EXISTS drama_generation_tasks_project_queue ON drama_generation_tasks(project_id, media_type, status, created_at ASC);
    `)
    this.ensureGenerationTaskColumns()
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

  getAsset(projectId: string, assetId: string): DramaAsset | null {
    const row = this.database.prepare('SELECT * FROM drama_assets WHERE project_id = ? AND id = ?').get(projectId, assetId) as SqliteRow | undefined
    return row ? this.toAsset(row) : null
  }

  createAsset(projectId: string, input: DramaAssetInput): DramaAsset {
    this.requireProject(projectId)
    const normalized = normalizeAssetInput(input)
    const now = Date.now()
    const id = randomUUID()
    this.database.prepare(`
      INSERT INTO drama_assets (id, project_id, asset_type, name, description, visual_prompt, status, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, 'draft', ?, ?)
    `).run(id, projectId, normalized.assetType, normalized.name, normalized.description, normalized.visualPrompt, now, now)
    this.touchProject(projectId)
    return this.getAsset(projectId, id) as DramaAsset
  }

  updateAsset(projectId: string, assetId: string, patch: DramaAssetPatch): DramaAsset {
    this.requireProject(projectId)
    const current = this.getAsset(projectId, assetId)
    if (!current) throw new Error(`短剧资产不存在：${assetId}`)
    const next = normalizeAssetPatch(current, patch)
    const now = Date.now()
    this.database.prepare(`
      UPDATE drama_assets
      SET asset_type = ?, name = ?, description = ?, visual_prompt = ?, status = ?, updated_at = ?
      WHERE project_id = ? AND id = ?
    `).run(next.assetType, next.name, next.description, next.visualPrompt, next.status, now, projectId, assetId)
    this.touchProject(projectId)
    return this.getAsset(projectId, assetId) as DramaAsset
  }

  deleteAsset(projectId: string, assetId: string): void {
    this.requireProject(projectId)
    const result = this.database.prepare('DELETE FROM drama_assets WHERE project_id = ? AND id = ?').run(projectId, assetId)
    if (result.changes === 0) throw new Error(`短剧资产不存在：${assetId}`)
    this.touchProject(projectId)
  }

  replaceAssets(projectId: string, inputs: DramaAssetInput[]): DramaAsset[] {
    this.requireProject(projectId)
    const now = Date.now()
    const incoming = new Map<string, DramaAssetInput>()
    for (const input of inputs) {
      const normalized = normalizeAssetInput(input)
      incoming.set(assetKey(normalized.assetType, normalized.name), normalized)
    }
    const existing = this.listAssets(projectId)
    const existingByKey = new Map(existing.map((asset) => [assetKey(asset.assetType, asset.name), asset]))
    this.database.exec('BEGIN')
    try {
      for (const input of incoming.values()) {
        const previous = existingByKey.get(assetKey(input.assetType, input.name))
        if (previous) {
          this.database.prepare(`
            UPDATE drama_assets
            SET description = ?, visual_prompt = ?, updated_at = ?
            WHERE project_id = ? AND id = ?
          `).run(input.description ?? '', input.visualPrompt ?? '', now, projectId, previous.id)
          continue
        }
        this.database.prepare(`
          INSERT INTO drama_assets (id, project_id, asset_type, name, description, visual_prompt, status, created_at, updated_at)
          VALUES (?, ?, ?, ?, ?, ?, 'draft', ?, ?)
        `).run(randomUUID(), projectId, input.assetType, input.name, input.description ?? '', input.visualPrompt ?? '', now, now)
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

  listGenerationTasks(projectId: string, mediaType?: DramaGenerationTask['mediaType']): DramaGenerationTask[] {
    const query = mediaType == null
      ? 'SELECT * FROM drama_generation_tasks WHERE project_id = ? ORDER BY created_at ASC'
      : 'SELECT * FROM drama_generation_tasks WHERE project_id = ? AND media_type = ? ORDER BY created_at ASC'
    const rows = (mediaType == null
      ? this.database.prepare(query).all(projectId)
      : this.database.prepare(query).all(projectId, mediaType)) as SqliteRow[]
    return rows.map((row) => this.toGenerationTask(row))
  }

  getGenerationTask(projectId: string, taskId: string): DramaGenerationTask | null {
    const row = this.database.prepare('SELECT * FROM drama_generation_tasks WHERE project_id = ? AND id = ?').get(projectId, taskId) as SqliteRow | undefined
    return row ? this.toGenerationTask(row) : null
  }

  createGenerationTask(projectId: string, input: DramaGenerationTaskInput): DramaGenerationTask {
    this.requireProject(projectId)
    const normalized = normalizeGenerationTaskInput(input)
    const now = Date.now()
    const task: DramaGenerationTask = {
      id: randomUUID(),
      projectId,
      mediaType: normalized.mediaType,
      targetId: normalized.targetId,
      prompt: normalized.prompt,
      status: 'queued',
      progress: 0,
      message: normalized.message || '等待生成',
      providerId: normalized.providerId,
      model: normalized.model,
      parameters: normalized.parameters,
      attempt: 0,
      maxAttempts: normalized.maxAttempts,
      estimatedCost: normalized.estimatedCost,
      createdAt: now,
      updatedAt: now
    }
    this.database.prepare(`
      INSERT INTO drama_generation_tasks (id, project_id, media_type, target_id, prompt, status, progress, message, provider_id, model, parameters_json, attempt, max_attempts, estimated_cost, actual_cost, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(task.id, task.projectId, task.mediaType, task.targetId ?? null, task.prompt, task.status, task.progress, task.message, task.providerId, task.model ?? null, JSON.stringify(task.parameters), task.attempt, task.maxAttempts, task.estimatedCost ?? null, null, task.createdAt, task.updatedAt)
    this.touchProject(projectId)
    return task
  }

  claimNextGenerationTask(projectId: string, mediaType: DramaGenerationTask['mediaType']): DramaGenerationTask | null {
    this.requireProject(projectId)
    if (!isGenerationMediaType(mediaType)) throw new Error('生成任务媒体类型无效')
    this.database.exec('BEGIN IMMEDIATE')
    try {
      const row = this.database.prepare(`
        SELECT * FROM drama_generation_tasks
        WHERE project_id = ? AND media_type = ? AND status = 'queued'
        ORDER BY created_at ASC
        LIMIT 1
      `).get(projectId, mediaType) as SqliteRow | undefined
      if (!row) {
        this.database.exec('COMMIT')
        return null
      }
      const startedAt = Date.now()
      this.database.prepare(`UPDATE drama_generation_tasks SET status = 'running', attempt = attempt + 1, started_at = ?, updated_at = ?, message = ? WHERE id = ?`).run(startedAt, startedAt, '生成中', stringValue(row, 'id'))
      this.database.exec('COMMIT')
      return this.getGenerationTask(projectId, stringValue(row, 'id'))
    } catch (error) {
      this.database.exec('ROLLBACK')
      throw error
    }
  }

  updateGenerationTask(projectId: string, taskId: string, patch: DramaGenerationTaskPatch): DramaGenerationTask {
    const current = this.getGenerationTask(projectId, taskId)
    if (!current) throw new Error(`生成任务不存在：${taskId}`)
    const nextStatus = patch.status ?? current.status
    if (!isGenerationTaskStatus(nextStatus)) throw new Error('生成任务状态无效')
    const nextProgress = patch.progress == null ? current.progress : normalizeProgress(patch.progress)
    const nextMessage = patch.message ?? current.message
    const nextProviderId = patch.providerId ?? current.providerId
    const nextModel = patch.model === undefined ? current.model ?? null : patch.model
    const nextParameters = patch.parameters ?? current.parameters
    const nextAttempt = patch.attempt == null ? current.attempt : normalizeNonNegativeInteger(patch.attempt, '生成任务尝试次数')
    const nextMaxAttempts = patch.maxAttempts == null ? current.maxAttempts : normalizePositiveInteger(patch.maxAttempts, current.maxAttempts)
    const nextEstimatedCost = patch.estimatedCost === undefined
      ? current.estimatedCost ?? null
      : patch.estimatedCost === null ? null : normalizeCost(patch.estimatedCost, '生成任务预估成本')
    const nextActualCost = patch.actualCost === undefined
      ? current.actualCost ?? null
      : patch.actualCost === null ? null : normalizeCost(patch.actualCost, '生成任务实际成本')
    const nextError = patch.error === undefined ? current.error ?? null : patch.error
    const nextResultPath = patch.resultPath === undefined ? current.resultPath ?? null : patch.resultPath
    const startedAt = nextStatus === 'running' ? current.startedAt ?? Date.now() : current.startedAt ?? null
    const completedAt = ['completed', 'failed', 'cancelled'].includes(nextStatus) ? current.completedAt ?? Date.now() : null
    const updatedAt = Date.now()
    this.database.prepare(`
      UPDATE drama_generation_tasks
      SET status = ?, progress = ?, message = ?, provider_id = ?, model = ?, parameters_json = ?, attempt = ?, max_attempts = ?, estimated_cost = ?, actual_cost = ?, error = ?, result_path = ?, started_at = ?, completed_at = ?, updated_at = ?
      WHERE project_id = ? AND id = ?
    `).run(nextStatus, nextStatus === 'completed' ? 1 : nextProgress, nextMessage, nextProviderId, nextModel, JSON.stringify(nextParameters), nextAttempt, nextMaxAttempts, nextEstimatedCost, nextActualCost, nextError, nextResultPath, startedAt, completedAt, updatedAt, projectId, taskId)
    this.touchProject(projectId)
    return this.getGenerationTask(projectId, taskId) as DramaGenerationTask
  }

  cancelGenerationTask(projectId: string, taskId: string): DramaGenerationTask {
    const current = this.getGenerationTask(projectId, taskId)
    if (!current) throw new Error(`生成任务不存在：${taskId}`)
    if (['completed', 'failed', 'cancelled'].includes(current.status)) return current
    return this.updateGenerationTask(projectId, taskId, { status: 'cancelled', message: '已取消' })
  }

  retryGenerationTask(projectId: string, taskId: string, message = '等待重试'): DramaGenerationTask | null {
    const current = this.getGenerationTask(projectId, taskId)
    if (!current || current.status !== 'failed' || current.attempt >= current.maxAttempts) return null
    return this.updateGenerationTask(projectId, taskId, { status: 'queued', progress: 0, message, error: null })
  }

  recoverGenerationTasks(projectId?: string): number {
    if (projectId) this.requireProject(projectId)
    const result = projectId == null
      ? this.database.prepare("UPDATE drama_generation_tasks SET status = 'queued', progress = 0, message = '等待恢复', error = NULL, started_at = NULL, completed_at = NULL, updated_at = ? WHERE status = 'running'").run(Date.now())
      : this.database.prepare("UPDATE drama_generation_tasks SET status = 'queued', progress = 0, message = '等待恢复', error = NULL, started_at = NULL, completed_at = NULL, updated_at = ? WHERE project_id = ? AND status = 'running'").run(Date.now(), projectId)
    const changes = Number(result.changes)
    if (changes > 0 && projectId) this.touchProject(projectId)
    return changes
  }

  listGraphTemplates(): DramaGraphTemplate[] {
    const rows = this.database.prepare('SELECT * FROM drama_graph_templates ORDER BY name ASC').all() as SqliteRow[]
    return rows.map((row) => this.toGraphTemplate(row)).filter((template): template is DramaGraphTemplate => template !== null)
  }

  getGraphTemplate(templateId: string): DramaGraphTemplate | null {
    const row = this.database.prepare('SELECT * FROM drama_graph_templates WHERE id = ?').get(templateId) as SqliteRow | undefined
    return row ? this.toGraphTemplate(row) : null
  }

  saveGraphTemplate(templateId: string | undefined, input: DramaGraphTemplateInput): DramaGraphTemplate {
    const normalized = normalizeGraphTemplateInput(input)
    const existing = templateId ? this.getGraphTemplate(templateId) : null
    if (templateId && !existing) throw new Error(`节点图模板不存在：${templateId}`)
    const now = Date.now()
    const id = existing?.id ?? randomUUID()
    this.database.prepare(`
      INSERT INTO drama_graph_templates (id, name, description, nodes_json, edges_json, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        name = excluded.name,
        description = excluded.description,
        nodes_json = excluded.nodes_json,
        edges_json = excluded.edges_json,
        updated_at = excluded.updated_at
    `).run(id, normalized.name, normalized.description, JSON.stringify(normalized.nodes), JSON.stringify(normalized.edges), existing?.createdAt ?? now, now)
    return this.getGraphTemplate(id) as DramaGraphTemplate
  }

  deleteGraphTemplate(templateId: string): void {
    const result = this.database.prepare('DELETE FROM drama_graph_templates WHERE id = ?').run(templateId)
    if (Number(result.changes) === 0) throw new Error(`节点图模板不存在：${templateId}`)
  }

  private requireProject(projectId: string): DramaProject {
    const project = this.getProject(projectId)
    if (!project) throw new Error(`短剧项目不存在：${projectId}`)
    return project
  }

  private ensureGenerationTaskColumns(): void {
    const rows = this.database.prepare('PRAGMA table_info(drama_generation_tasks)').all() as Array<{ name?: unknown }>
    const existing = new Set(rows.map((row) => typeof row.name === 'string' ? row.name : ''))
    const columns: Array<[string, string]> = [
      ['provider_id', "TEXT NOT NULL DEFAULT 'unconfigured'"],
      ['model', 'TEXT'],
      ['parameters_json', "TEXT NOT NULL DEFAULT '{}'"],
      ['attempt', 'INTEGER NOT NULL DEFAULT 0'],
      ['max_attempts', 'INTEGER NOT NULL DEFAULT 2'],
      ['estimated_cost', 'REAL'],
      ['actual_cost', 'REAL'],
      ['updated_at', 'INTEGER NOT NULL DEFAULT 0']
    ]
    for (const [name, definition] of columns) {
      if (!existing.has(name)) this.database.exec(`ALTER TABLE drama_generation_tasks ADD COLUMN ${name} ${definition}`)
    }
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

  private toGenerationTask(row: SqliteRow): DramaGenerationTask {
    const createdAt = numberValue(row, 'created_at')
    const storedUpdatedAt = numberValue(row, 'updated_at')
    return {
      id: stringValue(row, 'id'),
      projectId: stringValue(row, 'project_id'),
      mediaType: stringValue(row, 'media_type') as DramaGenerationTask['mediaType'],
      targetId: typeof row.target_id === 'string' ? row.target_id : undefined,
      prompt: stringValue(row, 'prompt'),
      status: stringValue(row, 'status') as DramaGenerationTask['status'],
      progress: numberValue(row, 'progress'),
      message: stringValue(row, 'message'),
      providerId: stringValue(row, 'provider_id', 'unconfigured'),
      model: typeof row.model === 'string' ? row.model : undefined,
      parameters: parseGenerationParameters(row.parameters_json),
      attempt: numberValue(row, 'attempt'),
      maxAttempts: numberValue(row, 'max_attempts', 2),
      estimatedCost: optionalNumberValue(row, 'estimated_cost'),
      actualCost: optionalNumberValue(row, 'actual_cost'),
      error: typeof row.error === 'string' ? row.error : undefined,
      resultPath: typeof row.result_path === 'string' ? row.result_path : undefined,
      createdAt,
      updatedAt: storedUpdatedAt || createdAt,
      startedAt: typeof row.started_at === 'number' ? row.started_at : undefined,
      completedAt: typeof row.completed_at === 'number' ? row.completed_at : undefined
    }
  }

  private toGraphTemplate(row: SqliteRow): DramaGraphTemplate | null {
    const nodes = parseGraphNodes(row.nodes_json)
    const edges = parseGraphEdges(row.edges_json)
    if (!nodes || !edges) return null
    return {
      id: stringValue(row, 'id'),
      name: stringValue(row, 'name'),
      description: stringValue(row, 'description'),
      nodes,
      edges,
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

function assetKey(assetType: DramaAsset['assetType'], name: string): string {
  return `${assetType}\u0000${name}`
}

function normalizeAssetInput(input: DramaAssetInput): Required<DramaAssetInput> {
  if (!input || typeof input !== 'object') throw new Error('短剧资产参数无效')
  if (!['character', 'location', 'prop'].includes(input.assetType)) throw new Error('短剧资产类型无效')
  const name = input.name.trim()
  if (!name) throw new Error('短剧资产名称不能为空')
  return {
    assetType: input.assetType,
    name,
    description: input.description?.trim() ?? '',
    visualPrompt: input.visualPrompt?.trim() ?? ''
  }
}

function normalizeAssetPatch(current: DramaAsset, patch: DramaAssetPatch): Required<DramaAssetInput> & Pick<DramaAsset, 'status'> {
  if (!patch || typeof patch !== 'object') throw new Error('短剧资产修改参数无效')
  const next = normalizeAssetInput({
    assetType: patch.assetType ?? current.assetType,
    name: patch.name ?? current.name,
    description: patch.description ?? current.description,
    visualPrompt: patch.visualPrompt ?? current.visualPrompt
  })
  if (patch.status != null && !['draft', 'ready'].includes(patch.status)) throw new Error('短剧资产状态无效')
  return { ...next, status: patch.status ?? current.status }
}

function isGenerationMediaType(value: unknown): value is DramaGenerationTask['mediaType'] {
  return value === 'image' || value === 'video' || value === 'audio'
}

function isGenerationTaskStatus(value: unknown): value is DramaGenerationTaskStatus {
  return value === 'queued' || value === 'running' || value === 'completed' || value === 'failed' || value === 'cancelled'
}

function normalizeGenerationTaskInput(input: DramaGenerationTaskInput): Required<Pick<DramaGenerationTaskInput, 'mediaType' | 'prompt' | 'providerId' | 'parameters' | 'maxAttempts'>> & Pick<DramaGenerationTaskInput, 'targetId' | 'message' | 'model' | 'estimatedCost'> {
  if (!input || typeof input !== 'object') throw new Error('生成任务参数无效')
  if (!isGenerationMediaType(input.mediaType)) throw new Error('生成任务媒体类型无效')
  const prompt = input.prompt.trim()
  if (!prompt) throw new Error('生成任务提示词不能为空')
  const maxAttempts = input.maxAttempts == null ? 2 : normalizePositiveInteger(input.maxAttempts, 2)
  if (maxAttempts > 5) throw new Error('生成任务最大尝试次数不能超过 5')
  const parameters: Record<string, string | number | boolean> = {}
  for (const [key, value] of Object.entries(input.parameters ?? {})) {
    if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') parameters[key] = value
  }
  return {
    mediaType: input.mediaType,
    targetId: input.targetId?.trim() || undefined,
    prompt,
    message: input.message?.trim() || undefined,
    providerId: input.providerId?.trim() || 'unconfigured',
    model: input.model?.trim() || undefined,
    parameters,
    maxAttempts,
    estimatedCost: input.estimatedCost == null ? undefined : normalizeCost(input.estimatedCost, '生成任务预估成本')
  }
}

function parseGenerationParameters(value: unknown): Record<string, string | number | boolean> {
  if (typeof value !== 'string' || !value.trim()) return {}
  try {
    const parsed = JSON.parse(value) as unknown
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {}
    const parameters: Record<string, string | number | boolean> = {}
    for (const [key, item] of Object.entries(parsed)) {
      if (typeof item === 'string' || typeof item === 'number' || typeof item === 'boolean') parameters[key] = item
    }
    return parameters
  } catch {
    return {}
  }
}

function normalizeNonNegativeInteger(value: number, label: string): number {
  if (!Number.isInteger(value) || value < 0) throw new Error(`${label}无效`)
  return value
}

function normalizeProgress(value: number): number {
  if (!Number.isFinite(value)) throw new Error('生成任务进度无效')
  return Math.min(1, Math.max(0, value))
}

function normalizeCost(value: number, label: string): number {
  if (!Number.isFinite(value) || value < 0 || value > 1_000_000) throw new Error(`${label}无效`)
  return Math.round(value * 1_000_000) / 1_000_000
}

function optionalNumberValue(row: SqliteRow, key: string): number | undefined {
  return typeof row[key] === 'number' && Number.isFinite(row[key] as number) ? row[key] as number : undefined
}

function isGraphNodeType(value: unknown): value is DramaGraphTemplate['nodes'][number]['type'] {
  return value === 'asset-input' || value === 'prompt' || value === 'generate-image' || value === 'generate-video' || value === 'generate-audio' || value === 'timeline-output'
}

function normalizeGraphTemplateInput(input: DramaGraphTemplateInput): Omit<DramaGraphTemplate, 'id' | 'createdAt' | 'updatedAt'> {
  if (!input || typeof input !== 'object') throw new Error('节点图模板参数无效')
  const name = input.name.trim()
  if (!name) throw new Error('节点图模板名称不能为空')
  const nodes = (input.nodes ?? []).map((node) => {
    if (!node || typeof node !== 'object' || typeof node.id !== 'string' || !node.id.trim() || !isGraphNodeType(node.type) || typeof node.title !== 'string') throw new Error('节点图包含无效节点')
    const config: Record<string, string | number | boolean> = {}
    for (const [key, value] of Object.entries(node.config ?? {})) {
      if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') config[key] = value
    }
    const input = typeof node.input === 'string' ? node.input.trim() || undefined : undefined
    const output = typeof node.output === 'string' ? node.output.trim() || undefined : undefined
    const providerId = typeof node.providerId === 'string' ? node.providerId.trim() || undefined : undefined
    const estimatedCost = typeof node.estimatedCost === 'number' && Number.isFinite(node.estimatedCost) && node.estimatedCost >= 0 ? node.estimatedCost : undefined
    return { id: node.id.trim(), type: node.type, title: node.title.trim() || node.id.trim(), input, output, providerId, estimatedCost, config }
  })
  if (nodes.length > 64) throw new Error('节点图节点数不能超过 64 个')
  const nodeIds = new Set<string>()
  for (const node of nodes) {
    if (nodeIds.has(node.id)) throw new Error(`节点图存在重复节点：${node.id}`)
    nodeIds.add(node.id)
  }
  const edges = (input.edges ?? []).map((edge) => {
    if (!edge || typeof edge !== 'object' || typeof edge.from !== 'string' || typeof edge.to !== 'string') throw new Error('节点图包含无效连线')
    const from = edge.from.trim()
    const to = edge.to.trim()
    if (!from || !to || from === to || !nodeIds.has(from) || !nodeIds.has(to)) throw new Error('节点图连线必须连接现有的两个不同节点')
    return { from, to }
  })
  if (edges.length > 128) throw new Error('节点图连线数不能超过 128 条')
  const adjacency = new Map(nodes.map((node) => [node.id, [] as string[]]))
  const indegree = new Map(nodes.map((node) => [node.id, 0]))
  for (const edge of edges) {
    const targets = adjacency.get(edge.from) as string[]
    if (targets.includes(edge.to)) throw new Error('节点图存在重复连线')
    targets.push(edge.to)
    indegree.set(edge.to, (indegree.get(edge.to) ?? 0) + 1)
  }
  const queue = nodes.filter((node) => indegree.get(node.id) === 0).map((node) => node.id)
  let visited = 0
  while (queue.length > 0) {
    const nodeId = queue.shift() as string
    visited += 1
    for (const target of adjacency.get(nodeId) ?? []) {
      const next = (indegree.get(target) ?? 0) - 1
      indegree.set(target, next)
      if (next === 0) queue.push(target)
    }
  }
  if (visited !== nodes.length) throw new Error('节点图不能包含循环')
  return { name, description: input.description?.trim() ?? '', nodes, edges }
}

function parseGraphNodes(value: unknown): DramaGraphTemplate['nodes'] | null {
  if (typeof value !== 'string') return null
  try {
    const parsed = JSON.parse(value) as unknown
    if (!Array.isArray(parsed)) return null
    return parsed as DramaGraphTemplate['nodes']
  } catch {
    return null
  }
}

function parseGraphEdges(value: unknown): DramaGraphTemplate['edges'] | null {
  if (typeof value !== 'string') return null
  try {
    const parsed = JSON.parse(value) as unknown
    if (!Array.isArray(parsed)) return null
    return parsed as DramaGraphTemplate['edges']
  } catch {
    return null
  }
}

function normalizePositiveInteger(value: number | undefined, fallback: number): number {
  return typeof value === 'number' && Number.isInteger(value) && value > 0 ? value : fallback
}
