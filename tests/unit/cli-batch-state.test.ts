import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { afterEach, describe, expect, it } from 'vitest'
import { createBatchState, getBatchPlanFingerprint, loadBatchState, reconcileBatchState, saveBatchState } from '../../src/cli/cli-batch-state'
import { parseBatchPlan } from '../../src/cli/cli-batch-plan'
import { parseCliArgs } from '../../src/cli/cli-parser'

const temporaryDirectories: string[] = []

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })))
})

function createPlan() {
  return parseBatchPlan(parseCliArgs(['batch', '/videos', '--asr', '--translate', 'zh', '--index', '--output-dir', '/subtitles']))
}

describe('aivcli batch state', () => {
  it('persists atomically and restores the same plan', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'aivplayer-cli-batch-state-'))
    temporaryDirectories.push(directory)
    const statePath = join(directory, 'nested', 'state.json')
    const signatures = [{ path: '/videos/one.mp4', sizeBytes: 10, mtimeMs: 20 }]
    const state = createBatchState(createPlan(), signatures)

    await saveBatchState(statePath, state)

    const loaded = await loadBatchState(statePath)
    expect(loaded?.planFingerprint).toBe(getBatchPlanFingerprint(createPlan()))
    expect(loaded?.videos['/videos/one.mp4']).toMatchObject(signatures[0])
    expect(JSON.parse(await readFile(statePath, 'utf8')).version).toBe(1)
  })

  it('invalidates completed stages when the source video changes', () => {
    const state = createBatchState(createPlan(), [{ path: '/videos/one.mp4', sizeBytes: 10, mtimeMs: 20 }])
    state.videos['/videos/one.mp4'].asr = { completedAt: 1, subtitlePath: '/cache/one.vtt', outputs: [] }
    state.videos['/videos/one.mp4'].translate = { completedAt: 1, subtitlePath: '/cache/one.zh.vtt', outputs: [] }
    state.index = { key: 'old', completedAt: 1 }

    const changed = reconcileBatchState(state, [{ path: '/videos/one.mp4', sizeBytes: 11, mtimeMs: 21 }])

    expect(changed).toBe(true)
    expect(state.videos['/videos/one.mp4'].asr).toBeUndefined()
    expect(state.videos['/videos/one.mp4'].translate).toBeUndefined()
    expect(state.index).toBeUndefined()
  })

  it('rejects malformed state files instead of silently resuming them', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'aivplayer-cli-batch-state-invalid-'))
    temporaryDirectories.push(directory)
    const statePath = join(directory, 'state.json')
    await writeFile(statePath, '{"version":999}')

    await expect(loadBatchState(statePath)).rejects.toThrow('状态文件版本不受支持')
  })
})
