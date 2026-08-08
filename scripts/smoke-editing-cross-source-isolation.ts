import { _electron as electron } from 'playwright'
import { copyFile, mkdtemp } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'

const sourceMediaPath = process.argv[2] ?? '/Users/ponponon/Music/aivplayer_test_video_1min.mp4'

type StoredCaption = {
  id: string
  sourceId?: string
  sourceStartSeconds?: number
  sourceEndSeconds?: number
  startSeconds: number
  durationSeconds: number
  kind: 'source' | 'translation'
  text: string
}

type StoredProject = {
  sources: Array<{ id: string; path: string; durationSeconds: number; fingerprint: string; name: string; width?: number; height?: number }>
  videoClips: Array<{ id: string; sourceId: string; sourceStartSeconds: number; sourceEndSeconds: number }>
  captions: StoredCaption[]
  scriptSegments?: Array<{ id: string; sourceId: string; sourceStartSeconds: number; sourceEndSeconds: number; text: string; translationText?: string; deleted?: boolean }>
  updatedAt: number
  [key: string]: unknown
}

async function main(): Promise<void> {
  const smokeDirectory = await mkdtemp(join(tmpdir(), 'aivplayer-smoke-cross-source-isolation-'))
  const secondaryMediaPath = join(smokeDirectory, 'secondary-source.mp4')
  const smokeHomeDirectory = await mkdtemp(join(tmpdir(), 'aivplayer-smoke-cross-source-isolation-home-'))
  await copyFile(sourceMediaPath, secondaryMediaPath)

  const app = await electron.launch({
    args: ['--no-sandbox', '--in-process-gpu', `--user-data-dir=${smokeHomeDirectory}`, 'out/main/index.js', sourceMediaPath],
    env: { ...process.env, HOME: smokeHomeDirectory }
  })

  try {
    const page = await app.firstWindow()
    const consoleErrors: string[] = []
    page.on('console', (message) => { if (message.type() === 'error') consoleErrors.push(message.text()) })
    page.on('pageerror', (error) => consoleErrors.push(error.message))

    const openEditor = async (waitForScript = true): Promise<void> => {
      await page.waitForLoadState('domcontentloaded')
      await page.waitForSelector('video.video-surface', { timeout: 10_000 })
      if (await page.locator('[data-testid="editing-timeline"]').count() === 0) await page.locator('.clip-editor-tool-button').click()
      await page.locator('[data-testid="editing-timeline"]').waitFor({ timeout: 10_000 })
      if (waitForScript) await page.locator('[data-testid^="editing-script-row-"]').first().waitFor({ timeout: 10_000 })
    }
    const readStoredProject = async (): Promise<StoredProject | null> => page.evaluate(() => {
      const entries = Object.values(JSON.parse(localStorage.getItem('aivplayer.editing-projects.v1') ?? '{}') as Record<string, StoredProject>)
      return entries[0] ?? null
    })
    const waitForStored = async (predicate: (project: StoredProject) => boolean): Promise<StoredProject> => {
      const deadline = Date.now() + 10_000
      while (Date.now() < deadline) {
        const project = await readStoredProject()
        if (project && predicate(project)) return project
        await new Promise((resolve) => setTimeout(resolve, 100))
      }
      throw new Error(`Cross-source isolation Smoke timed out: ${JSON.stringify(await readStoredProject())}`)
    }

    await openEditor(false)
    const prepared = await page.evaluate((secondaryPath) => {
      const entries = Object.entries(JSON.parse(localStorage.getItem('aivplayer.editing-projects.v1') ?? '{}') as Record<string, StoredProject>)
      const [storageKey, original] = entries[0] ?? []
      if (!storageKey || !original) throw new Error('Cross-source isolation Smoke could not find the initial project')
      const primary = original.sources[0]
      const originalClip = original.videoClips[0]
      if (!primary || !originalClip) throw new Error('Cross-source isolation Smoke could not find the primary source')
      const secondary = { id: 'source-secondary-media', path: secondaryPath, name: 'secondary-source.mp4', durationSeconds: primary.durationSeconds, fingerprint: `${secondaryPath}:${primary.durationSeconds}`, width: primary.width, height: primary.height }
      const segmentId = 'source-reused-caption-1'
      const project: StoredProject = {
        ...original,
        sources: [primary, secondary],
        videoClips: [{ ...originalClip, id: 'cross-source-clip', sourceId: primary.id, sourceStartSeconds: 0, sourceEndSeconds: 1 }],
        captions: [
          { id: segmentId, sourceId: primary.id, sourceStartSeconds: 0, sourceEndSeconds: 1, startSeconds: 0, durationSeconds: 1, kind: 'source', text: '旧素材原文' },
          { id: 'translation-reused-caption-1', sourceId: primary.id, sourceStartSeconds: 0, sourceEndSeconds: 1, startSeconds: 0, durationSeconds: 1, kind: 'translation', text: '旧素材译文' }
        ],
        scriptSegments: [{ id: segmentId, sourceId: primary.id, sourceStartSeconds: 0, sourceEndSeconds: 1, text: '旧素材原文', translationText: '旧素材译文', deleted: true }],
        updatedAt: Date.now()
      }
      localStorage.setItem('aivplayer.editing-projects.v1', JSON.stringify({ [storageKey]: project }))
      return { primaryId: primary.id, secondaryId: secondary.id, segmentId }
    }, secondaryMediaPath)

    await page.reload()
    await openEditor()
    const orphanBeforeReplace = await page.locator('[data-testid^="editing-caption-item-"]').filter({ hasText: '旧素材译文' }).getAttribute('data-editing-orphan-translation')
    const orphanNoticeBeforeReplace = await page.locator('[data-testid="editing-caption-orphan-notice"]').count()

    await page.locator(`[data-testid="editing-asset-${prepared.secondaryId}"]`).dragTo(page.locator('.editing-clip').first())
    const replaced = await waitForStored((project) => project.videoClips[0]?.sourceId === prepared.secondaryId && project.captions.every((caption) => caption.sourceId === prepared.secondaryId) && project.scriptSegments?.[0]?.sourceId === prepared.primaryId && project.scriptSegments[0]?.deleted === true)
    const translationAfterReplace = page.locator('[data-testid^="editing-caption-item-"]').filter({ hasText: '旧素材译文' })
    await page.waitForFunction(() => !document.querySelector('[data-testid="editing-caption-orphan-notice"]'), null, { timeout: 10_000 })
    const orphanAfterReplace = await translationAfterReplace.getAttribute('data-editing-orphan-translation')
    const translationClassAfterReplace = await translationAfterReplace.getAttribute('class')

    await page.reload()
    await openEditor()
    const persisted = await waitForStored((project) => project.videoClips[0]?.sourceId === prepared.secondaryId && project.captions.every((caption) => caption.sourceId === prepared.secondaryId) && project.scriptSegments?.[0]?.sourceId === prepared.primaryId && project.scriptSegments[0]?.deleted === true)
    const translationAfterReload = page.locator('[data-testid^="editing-caption-item-"]').filter({ hasText: '旧素材译文' })
    const orphanAfterReload = await translationAfterReload.getAttribute('data-editing-orphan-translation')
    const orphanNoticeAfterReload = await page.locator('[data-testid="editing-caption-orphan-notice"]').count()
    const screenshotPath = join(smokeHomeDirectory, 'aivplayer-smoke-cross-source-isolation.png')
    await page.screenshot({ path: screenshotPath, fullPage: false })
    const result = {
      orphanBeforeReplace,
      orphanNoticeBeforeReplace,
      orphanAfterReplace,
      translationClassAfterReplace: translationClassAfterReplace ?? '',
      orphanAfterReload,
      orphanNoticeAfterReload,
      replacedSourceId: replaced.videoClips[0]?.sourceId,
      replacedScriptSourceId: replaced.scriptSegments?.[0]?.sourceId,
      persistedSourceId: persisted.videoClips[0]?.sourceId,
      persistedScriptSourceId: persisted.scriptSegments?.[0]?.sourceId,
      screenshotPath,
      consoleErrors
    }
    console.log('AIVPlayer Smoke Editing Cross-Source Isolation')
    console.log(JSON.stringify(result))
    if (result.orphanBeforeReplace !== 'true' || result.orphanNoticeBeforeReplace !== 1 || result.orphanAfterReplace !== null || result.translationClassAfterReplace.includes('is-orphan-translation') || result.orphanAfterReload !== null || result.orphanNoticeAfterReload !== 0 || result.replacedSourceId !== prepared.secondaryId || result.replacedScriptSourceId !== prepared.primaryId || result.persistedSourceId !== prepared.secondaryId || result.persistedScriptSourceId !== prepared.primaryId || result.consoleErrors.length > 0) process.exitCode = 1
  } finally {
    await app.close()
  }
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
