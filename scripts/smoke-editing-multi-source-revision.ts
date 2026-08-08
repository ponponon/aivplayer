import { _electron as electron } from 'playwright'
import { copyFile, mkdtemp, unlink, utimes, writeFile } from 'node:fs/promises'
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

type StoredSourceRevision = { source: number | null; translation: number | null }

type StoredProject = {
  sources: Array<{ id: string; path: string; durationSeconds: number; fingerprint: string; name: string; width?: number; height?: number }>
  videoClips: Array<{ id: string; sourceId: string; sourceStartSeconds: number; sourceEndSeconds: number }>
  captions: StoredCaption[]
  scriptSegments?: Array<{ id: string; sourceId: string; sourceStartSeconds: number; sourceEndSeconds: number; text: string; translationText?: string; deleted?: boolean }>
  captionSourceRevision?: string
  captionSourceRevisions?: Record<string, StoredSourceRevision>
  captionReloadResolution?: unknown
  updatedAt: number
  [key: string]: unknown
}

function makeSrt(text: string): string {
  return `1\n00:00:00,000 --> 00:00:01,000\n${text}\n`
}

async function main(): Promise<void> {
  const smokeDirectory = await mkdtemp(join(tmpdir(), 'aivplayer-smoke-multi-source-revision-'))
  const primaryMediaPath = join(smokeDirectory, 'primary-source.mp4')
  const secondaryMediaPath = join(smokeDirectory, 'secondary-source.mp4')
  const primarySubtitlePath = join(smokeDirectory, 'primary-source.srt')
  const primaryTranslationPath = join(smokeDirectory, 'primary-source.translated.srt')
  const secondarySubtitlePath = join(smokeDirectory, 'secondary-source.srt')
  const secondaryTranslationPath = join(smokeDirectory, 'secondary-source.translated.srt')
  const smokeHomeDirectory = await mkdtemp(join(tmpdir(), 'aivplayer-smoke-multi-source-revision-home-'))
  await copyFile(sourceMediaPath, primaryMediaPath)
  await copyFile(sourceMediaPath, secondaryMediaPath)
  await writeFile(primarySubtitlePath, makeSrt('第一素材原文'))
  await writeFile(primaryTranslationPath, makeSrt('第一素材译文'))
  await writeFile(secondarySubtitlePath, makeSrt('第二素材原文'))
  await writeFile(secondaryTranslationPath, makeSrt('第二素材译文'))

  const app = await electron.launch({
    args: ['--no-sandbox', '--in-process-gpu', `--user-data-dir=${smokeHomeDirectory}`, 'out/main/index.js', primaryMediaPath],
    env: { ...process.env, HOME: smokeHomeDirectory }
  })

  try {
    const page = await app.firstWindow()
    const consoleErrors: string[] = []
    page.on('console', (message) => { if (message.type() === 'error') consoleErrors.push(message.text()) })
    page.on('pageerror', (error) => consoleErrors.push(error.message))

    const openEditor = async (): Promise<void> => {
      await page.waitForLoadState('domcontentloaded')
      await page.waitForSelector('video.video-surface', { timeout: 10_000 })
      if (await page.locator('[data-testid="editing-timeline"]').count() === 0) await page.locator('.clip-editor-tool-button').click()
      await page.locator('[data-testid="editing-timeline"]').waitFor({ timeout: 10_000 })
      await page.locator('[data-testid^="editing-script-row-"]').first().waitFor({ timeout: 10_000 })
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
      throw new Error(`Multi-source revision Smoke timed out: ${JSON.stringify(await readStoredProject())}`)
    }

    await openEditor()
    const prepared = await page.evaluate((secondaryPath) => {
      const entries = Object.entries(JSON.parse(localStorage.getItem('aivplayer.editing-projects.v1') ?? '{}') as Record<string, StoredProject>)
      const [storageKey, original] = entries[0] ?? []
      if (!storageKey || !original) throw new Error('Multi-source revision Smoke could not find the initial project')
      const primary = original.sources[0]
      const originalClip = original.videoClips[0]
      if (!primary || !originalClip) throw new Error('Multi-source revision Smoke could not find the primary source')
      const secondary = { id: 'source-secondary-revision', path: secondaryPath, name: 'secondary-source.mp4', durationSeconds: primary.durationSeconds, fingerprint: `${secondaryPath}:${primary.durationSeconds}`, width: primary.width, height: primary.height }
      const makeCaption = (sourceId: string, kind: 'source' | 'translation', text: string): StoredCaption => ({ id: `${kind}-${sourceId}-0`, sourceId, sourceStartSeconds: 0, sourceEndSeconds: 1, startSeconds: 0, durationSeconds: 1, kind, text })
      const project: StoredProject = {
        ...original,
        sources: [primary, secondary],
        videoClips: [
          { ...originalClip, id: 'multi-source-primary-clip', sourceId: primary.id, sourceStartSeconds: 0, sourceEndSeconds: 1 },
          { ...originalClip, id: 'multi-source-secondary-clip', sourceId: secondary.id, sourceStartSeconds: 0, sourceEndSeconds: 1 }
        ],
        captions: [makeCaption(primary.id, 'source', '第一素材原文'), makeCaption(primary.id, 'translation', '第一素材译文'), makeCaption(secondary.id, 'source', '第二素材原文'), makeCaption(secondary.id, 'translation', '第二素材译文')],
        scriptSegments: [
          { id: `source-${primary.id}-0`, sourceId: primary.id, sourceStartSeconds: 0, sourceEndSeconds: 1, text: '第一素材原文', translationText: '第一素材译文' },
          { id: `source-${secondary.id}-0`, sourceId: secondary.id, sourceStartSeconds: 0, sourceEndSeconds: 1, text: '第二素材原文', translationText: '第二素材译文' }
        ],
        updatedAt: Date.now()
      }
      delete project.captionSourceRevision
      delete project.captionSourceRevisions
      delete project.captionReloadResolution
      localStorage.setItem('aivplayer.editing-projects.v1', JSON.stringify({ [storageKey]: project }))
      return { primaryId: primary.id, secondaryId: secondary.id }
    }, secondaryMediaPath)

    await page.reload()
    await openEditor()
    const baseline = await waitForStored((project) => Boolean(project.captionSourceRevision) && Boolean(project.captionSourceRevisions?.[prepared.primaryId]) && Boolean(project.captionSourceRevisions?.[prepared.secondaryId]))
    const baselineConflictCount = await page.locator('[data-testid="editing-caption-reload-conflict"]').count()

    await writeFile(secondarySubtitlePath, makeSrt('第二素材新原文'))
    await writeFile(secondaryTranslationPath, makeSrt('第二素材新译文'))
    const revisionMs = Date.now() + 5_000
    await utimes(secondarySubtitlePath, new Date(revisionMs), new Date(revisionMs))
    await utimes(secondaryTranslationPath, new Date(revisionMs + 1_000), new Date(revisionMs + 1_000))

    await page.reload()
    await openEditor()
    await page.locator('[data-testid="editing-caption-reload-conflict"]').waitFor({ timeout: 10_000 })
    const conflict = page.locator('[data-testid="editing-caption-reload-conflict"]')
    const conflictRows = conflict.locator('.editing-caption-reload-row')
    const conflictRowCount = await conflictRows.count()
    const secondaryChangedRows = await conflictRows.filter({ hasText: '第二素材新' }).count()
    const primaryChangedRows = await conflictRows.filter({ hasText: '第一素材' }).count()
    await page.locator('[data-testid="editing-caption-reload-force"]').click()
    const forceReloaded = await waitForStored((project) => {
      const sourceTexts = project.captions.filter((caption) => caption.kind === 'source').map((caption) => caption.text)
      const translationTexts = project.captions.filter((caption) => caption.kind === 'translation').map((caption) => caption.text)
      return sourceTexts.includes('第一素材原文') && sourceTexts.includes('第二素材新原文') && translationTexts.includes('第一素材译文') && translationTexts.includes('第二素材新译文') && Boolean(project.captionSourceRevisions?.[prepared.primaryId]) && Boolean(project.captionSourceRevisions?.[prepared.secondaryId])
    })
    const forceConflictCount = await page.locator('[data-testid="editing-caption-reload-conflict"]').count()

    await unlink(secondarySubtitlePath)
    await unlink(secondaryTranslationPath)
    await page.reload()
    await openEditor()
    await page.locator('[data-testid="editing-caption-reload-conflict"]').waitFor({ timeout: 10_000 })
    const deletionConflict = page.locator('[data-testid="editing-caption-reload-conflict"]')
    const deletionRows = deletionConflict.locator('.editing-caption-reload-row')
    const deletionConflictRowCount = await deletionRows.count()
    const deletionRemovedRows = await deletionConflict.locator('.editing-caption-reload-row.is-removed').count()
    const deletionPrimaryRows = await deletionRows.filter({ hasText: '第一素材' }).count()
    await page.locator('[data-testid="editing-caption-reload-force"]').click()
    const deletionForceReloaded = await waitForStored((project) => {
      const sourceTexts = project.captions.filter((caption) => caption.kind === 'source').map((caption) => caption.text)
      const translationTexts = project.captions.filter((caption) => caption.kind === 'translation').map((caption) => caption.text)
      const secondaryRevision = project.captionSourceRevisions?.[prepared.secondaryId]
      return sourceTexts.length === 1 && translationTexts.length === 1 && sourceTexts.includes('第一素材原文') && translationTexts.includes('第一素材译文') && secondaryRevision?.source === null && secondaryRevision.translation === null
    })
    const deletionForceConflictCount = await page.locator('[data-testid="editing-caption-reload-conflict"]').count()
    const screenshotPath = join(smokeHomeDirectory, 'aivplayer-smoke-multi-source-revision.png')
    await page.screenshot({ path: screenshotPath, fullPage: false })
    const result = {
      baselineSourceRevision: baseline.captionSourceRevisions?.[prepared.primaryId]?.source ?? null,
      baselineTranslationRevision: baseline.captionSourceRevisions?.[prepared.primaryId]?.translation ?? null,
      baselineConflictCount,
      conflictRowCount,
      secondaryChangedRows,
      primaryChangedRows,
      forceConflictCount,
      forceSourceRevision: forceReloaded.captionSourceRevisions?.[prepared.secondaryId]?.source ?? null,
      forceTranslationRevision: forceReloaded.captionSourceRevisions?.[prepared.secondaryId]?.translation ?? null,
      deletionConflictRowCount,
      deletionRemovedRows,
      deletionPrimaryRows,
      deletionForceConflictCount,
      deletionSourceCount: deletionForceReloaded.captions.filter((caption) => caption.kind === 'source').length,
      deletionSecondarySourceRevision: deletionForceReloaded.captionSourceRevisions?.[prepared.secondaryId]?.source ?? null,
      sourceTexts: forceReloaded.captions.filter((caption) => caption.kind === 'source').map((caption) => caption.text),
      translationTexts: forceReloaded.captions.filter((caption) => caption.kind === 'translation').map((caption) => caption.text),
      screenshotPath,
      consoleErrors
    }
    console.log('AIVPlayer Smoke Editing Multi-Source Revision')
    console.log(JSON.stringify(result))
    if (result.baselineConflictCount !== 0 || result.conflictRowCount !== 2 || result.secondaryChangedRows !== 2 || result.primaryChangedRows !== 0 || result.forceConflictCount !== 0 || result.forceSourceRevision === null || result.forceTranslationRevision === null || result.deletionConflictRowCount !== 2 || result.deletionRemovedRows !== 2 || result.deletionPrimaryRows !== 0 || result.deletionForceConflictCount !== 0 || result.deletionSourceCount !== 1 || result.deletionSecondarySourceRevision !== null || result.consoleErrors.length > 0) process.exitCode = 1
  } finally {
    await app.close()
  }
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
