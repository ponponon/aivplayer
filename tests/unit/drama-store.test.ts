import { mkdtemp, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { DramaStore } from '../../src/core/drama/drama-store'

describe('drama store', () => {
  let tempDirectory: string
  let store: DramaStore

  beforeEach(async () => {
    tempDirectory = await mkdtemp(join(tmpdir(), 'aivplayer-drama-'))
    store = new DramaStore(tempDirectory)
  })

  afterEach(async () => {
    store.close()
    await rm(tempDirectory, { recursive: true, force: true })
  })

  it('persists projects, chapters, plans, scripts, assets, storyboards and tasks in SQLite', () => {
    const project = store.createProject({ title: '雨夜来信', genre: '悬疑', episodeCount: 12 })
    const chapters = store.importChapters(project.id, [
      { chapterIndex: 1, volume: '第1卷', title: '来信', content: '主角收到一封匿名信。' },
      { chapterIndex: 2, volume: '第1卷', title: '追踪', content: '主角循线追查。' }
    ])
    expect(chapters).toHaveLength(2)

    store.setChapterEvent(chapters[0]!.id, 'completed', {
      summary: '主角收到匿名信。', characters: ['主角'], locations: ['客厅'], conflict: '是否相信线索', hook: '信件指向旧案'
    })
    const plan = store.savePlan(project.id, { storySkeleton: '从匿名信开始的追查线。', adaptationStrategy: '每集结尾保留新线索。' })
    const script = store.saveScript(project.id, 1, '第一封信', '场景一：客厅。')
    const assets = store.replaceAssets(project.id, [
      { assetType: 'character', name: '主角', description: '追查匿名信的年轻人', visualPrompt: '电影感悬疑剧主角' },
      { assetType: 'location', name: '客厅', description: '收到信件的客厅', visualPrompt: '冷色悬疑剧客厅' }
    ])
    const storyboard = store.replaceStoryboard(project.id, 1, [{
      sceneIndex: 1,
      title: '拆信',
      durationSeconds: 6,
      location: '客厅',
      characters: ['主角'],
      action: '主角拆开匿名信。',
      dialogue: '主角：是谁寄来的？',
      visualPrompt: '雨夜室内，电影感光影',
      cameraPrompt: '手部特写后缓慢推近'
    }])
    const task = store.startTask(project.id, 'script', '1', '生成第1集')
    store.updateTask(task.id, 0.5, '处理中')
    const finishedTask = store.finishTask(task.id, 'completed', '完成')

    expect(store.getPlan(project.id)).toMatchObject(plan)
    expect(store.getScript(project.id, 1)).toMatchObject(script)
    expect(assets).toHaveLength(2)
    expect(storyboard[0]).toMatchObject({ episodeIndex: 1, sceneIndex: 1, characters: ['主角'], durationSeconds: 6 })
    expect(store.getChapter(chapters[0]!.id)?.eventStatus).toBe('completed')
    expect(store.getChapter(chapters[0]!.id)?.event?.hook).toBe('信件指向旧案')
    expect(finishedTask).toMatchObject({ status: 'completed', progress: 1, message: '完成' })

    store.close()
    store = new DramaStore(tempDirectory)
    expect(store.getProject(project.id)?.title).toBe('雨夜来信')
    expect(store.listChapters(project.id)).toHaveLength(2)
    expect(store.listScripts(project.id)).toHaveLength(1)
    expect(store.listAssets(project.id)).toHaveLength(2)
    expect(store.listStoryboards(project.id, 1)).toHaveLength(1)
  })

  it('upserts imported chapters and resets stale event state', () => {
    const project = store.createProject({ title: '重导入测试' })
    const [chapter] = store.importChapters(project.id, [{ chapterIndex: 1, title: '旧标题', content: '旧正文' }])
    store.setChapterEvent(chapter!.id, 'completed', { summary: '旧', characters: [], locations: [], conflict: '旧', hook: '旧' })

    const [updated] = store.importChapters(project.id, [{ chapterIndex: 1, title: '新标题', content: '新正文' }])
    expect(updated).toMatchObject({ id: chapter!.id, title: '新标题', content: '新正文', eventStatus: 'pending' })
    expect(updated!.event).toBeUndefined()
  })

  it('merges generated assets without deleting manual assets or resetting ready state', () => {
    const project = store.createProject({ title: '资产库合并' })
    const manual = store.createAsset(project.id, { assetType: 'prop', name: '旧怀表', description: '人工补充道具' })
    const ready = store.updateAsset(project.id, manual.id, { status: 'ready' })
    const generated = store.replaceAssets(project.id, [
      { assetType: 'prop', name: '旧怀表', description: 'AI 补充描述', visualPrompt: '银色怀表特写' },
      { assetType: 'character', name: '主角', description: '雨夜追信人' }
    ])

    expect(generated).toHaveLength(2)
    expect(store.getAsset(project.id, manual.id)).toMatchObject({ id: manual.id, status: 'ready', description: 'AI 补充描述', visualPrompt: '银色怀表特写' })
    expect(store.listAssets(project.id).find((asset) => asset.name === '主角')).toMatchObject({ status: 'draft' })
    expect(ready.createdAt).toBe(manual.createdAt)
  })

  it('supports manual asset editing and deletion within a project boundary', () => {
    const project = store.createProject({ title: '资产库维护' })
    const asset = store.createAsset(project.id, { assetType: 'location', name: '旧车站' })
    const updated = store.updateAsset(project.id, asset.id, { name: '废弃车站', description: '雨夜候车厅', status: 'ready' })

    expect(updated).toMatchObject({ name: '废弃车站', description: '雨夜候车厅', status: 'ready' })
    store.deleteAsset(project.id, asset.id)
    expect(store.getAsset(project.id, asset.id)).toBeNull()
    expect(() => store.deleteAsset(project.id, asset.id)).toThrow('短剧资产不存在')
  })

  it('keeps image, video and audio generation queues independent and recoverable', () => {
    const project = store.createProject({ title: '生成队列' })
    const image = store.createGenerationTask(project.id, { mediaType: 'image', targetId: 'asset-character', prompt: '角色正面肖像' })
    const secondImage = store.createGenerationTask(project.id, { mediaType: 'image', prompt: '场景概念图' })
    const video = store.createGenerationTask(project.id, { mediaType: 'video', prompt: '雨夜车站推镜' })
    const audio = store.createGenerationTask(project.id, { mediaType: 'audio', prompt: '雨声氛围' })

    expect(store.listGenerationTasks(project.id, 'image')).toHaveLength(2)
    expect(store.claimNextGenerationTask(project.id, 'image')).toMatchObject({ id: image.id, status: 'running' })
    expect(store.claimNextGenerationTask(project.id, 'image')).toMatchObject({ id: secondImage.id, status: 'running' })
    expect(store.claimNextGenerationTask(project.id, 'image')).toBeNull()
    expect(store.claimNextGenerationTask(project.id, 'video')).toMatchObject({ id: video.id, status: 'running' })

    const completed = store.updateGenerationTask(project.id, image.id, { status: 'completed', resultPath: '/tmp/character.png', message: '图片完成' })
    expect(completed).toMatchObject({ status: 'completed', progress: 1, resultPath: '/tmp/character.png' })
    expect(store.cancelGenerationTask(project.id, audio.id)).toMatchObject({ status: 'cancelled' })
    expect(store.recoverGenerationTasks(project.id)).toBe(2)
    expect(store.getGenerationTask(project.id, secondImage.id)).toMatchObject({ status: 'queued', progress: 0 })
    expect(store.getGenerationTask(project.id, video.id)).toMatchObject({ status: 'queued', progress: 0 })
  })

  it('persists reusable DAG templates and rejects invalid graph edges', () => {
    const template = store.saveGraphTemplate(undefined, {
      name: '角色一致性出图',
      description: '从资产提示词生成角色图并回流时间线。',
      nodes: [
        { id: 'asset', type: 'asset-input', title: '角色资产', config: { assetType: 'character' } },
        { id: 'image', type: 'generate-image', title: '生成角色图', config: { aspect: '9:16' } },
        { id: 'output', type: 'timeline-output', title: '回流时间线', config: {} }
      ],
      edges: [{ from: 'asset', to: 'image' }, { from: 'image', to: 'output' }]
    })

    expect(store.getGraphTemplate(template.id)).toMatchObject({ name: '角色一致性出图', nodes: expect.arrayContaining([expect.objectContaining({ id: 'asset' })]), edges: expect.arrayContaining([{ from: 'asset', to: 'image' }]) })
    expect(store.listGraphTemplates()).toHaveLength(1)
    expect(() => store.saveGraphTemplate(undefined, { name: '循环', nodes: [{ id: 'a', type: 'prompt', title: 'A', config: {} }, { id: 'b', type: 'prompt', title: 'B', config: {} }], edges: [{ from: 'a', to: 'b' }, { from: 'b', to: 'a' }] })).toThrow('节点图不能包含循环')

    store.deleteGraphTemplate(template.id)
    expect(store.listGraphTemplates()).toHaveLength(0)
  })
})
