import { mkdtemp, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { DramaStore } from '../../src/core/drama/drama-store'
import { DramaWorkflow } from '../../src/core/drama/drama-workflow'
import type { DramaProviderRequest } from '../../src/shared/drama-types'

describe('drama text workflow', () => {
  let tempDirectory: string
  let store: DramaStore
  let workflow: DramaWorkflow
  let calls: DramaProviderRequest['stage'][]

  beforeEach(async () => {
    tempDirectory = await mkdtemp(join(tmpdir(), 'aivplayer-drama-workflow-'))
    store = new DramaStore(tempDirectory)
    calls = []
    workflow = new DramaWorkflow(store, {
      async generate(request) {
        calls.push(request.stage)
        if (request.stage === 'events') return JSON.stringify({ summary: '主角发现线索。', characters: ['主角'], locations: ['车站'], conflict: '追兵逼近', hook: '线索指向旧仓库' })
        if (request.stage === 'skeleton') return JSON.stringify({ storySkeleton: '主角沿着线索追查旧案。' })
        if (request.stage === 'adaptation') return JSON.stringify({ adaptationStrategy: '每集开场抛出问题，结尾留下可视化悬念。' })
        if (request.stage === 'assets') return JSON.stringify({ assets: [{ assetType: 'character', name: '主角', description: '正在追查匿名信的年轻人', visualPrompt: '电影感悬疑剧主角' }, { assetType: 'location', name: '旧车站', description: '雨夜车站', visualPrompt: '雨夜废弃车站' }] })
        if (request.stage === 'storyboard') return JSON.stringify({ scenes: [{ sceneIndex: 1, title: '雨夜候车厅', durationSeconds: 6, location: '旧车站', characters: ['主角'], action: '主角拆开匿名信，抬头望向站台。', dialogue: '主角：你到底是谁？', visualPrompt: '雨夜候车厅，冷色电影光影', cameraPrompt: '中近景缓慢推进' }] })
        return JSON.stringify({ title: '车站的信', content: '场景一：车站。主角发现信封。' })
      }
    })
  })

  afterEach(async () => {
    store.close()
    await rm(tempDirectory, { recursive: true, force: true })
  })

  it('runs events, skeleton, adaptation and script stages', async () => {
    const project = store.createProject({ title: '文本流水线' })
    store.importChapters(project.id, [
      { chapterIndex: 1, title: '来信', content: '主角在车站收到一封信。' },
      { chapterIndex: 2, title: '追查', content: '主角开始追查寄信人。' }
    ])
    const progress: string[] = []

    const events = await workflow.extractEvents(project.id, { onProgress: (value) => progress.push(value.message) })
    const skeleton = await workflow.generateSkeleton(project.id, { onProgress: (value) => progress.push(value.message) })
    const adaptation = await workflow.generateAdaptationStrategy(project.id, { onProgress: (value) => progress.push(value.message) })
    const script = await workflow.generateScript(project.id, 1, { onProgress: (value) => progress.push(value.message) })
    const assets = await workflow.extractAssets(project.id, { onProgress: (value) => progress.push(value.message) })
    const storyboard = await workflow.generateStoryboard(project.id, 1, { onProgress: (value) => progress.push(value.message) })

    expect(events).toMatchObject({ completed: 2, skipped: 0, failed: 0 })
    expect(skeleton.skeleton).toContain('旧案')
    expect(adaptation.adaptationStrategy).toContain('悬念')
    expect(script.script).toMatchObject({ episodeIndex: 1, title: '车站的信' })
    expect(assets).toMatchObject({ completed: 1, skipped: 0, failed: 0 })
    expect(storyboard.storyboard[0]).toMatchObject({ episodeIndex: 1, title: '雨夜候车厅', location: '旧车站' })
    expect(calls).toEqual(['events', 'events', 'skeleton', 'adaptation', 'script', 'assets', 'storyboard'])
    expect(progress).toContain('故事骨架生成完成')
    expect(progress).toContain('改编策略生成完成')
  })

  it('skips completed stages so rerun is resumable', async () => {
    const project = store.createProject({ title: '断点续跑' })
    store.importChapters(project.id, [{ chapterIndex: 1, title: '第一章', content: '正文' }])

    await workflow.extractEvents(project.id)
    await workflow.generateSkeleton(project.id)
    await workflow.generateScript(project.id, 1)
    await workflow.extractAssets(project.id)
    await workflow.generateStoryboard(project.id, 1)
    calls = []

    const events = await workflow.extractEvents(project.id)
    const skeleton = await workflow.generateSkeleton(project.id)
    const script = await workflow.generateScript(project.id, 1)
    const assets = await workflow.extractAssets(project.id)
    const storyboard = await workflow.generateStoryboard(project.id, 1)

    expect(events).toMatchObject({ completed: 0, skipped: 1 })
    expect(skeleton.result).toMatchObject({ completed: 0, skipped: 1 })
    expect(script.result).toMatchObject({ completed: 0, skipped: 1 })
    expect(assets).toMatchObject({ completed: 0, skipped: 1 })
    expect(storyboard.result).toMatchObject({ completed: 0, skipped: 1 })
    expect(calls).toEqual([])
  })
})
