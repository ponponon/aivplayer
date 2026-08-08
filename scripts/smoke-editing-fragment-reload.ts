import { _electron as electron } from 'playwright'
import { copyFile, mkdtemp, utimes, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'

const sourceMediaPath = process.argv[2] ?? '/Users/ponponon/Music/aivplayer_test_video_1min.mp4'

type StoredCaption = {
  id: string
  kind: 'source' | 'translation'
  text: string
  sourceId?: string
  sourceStartSeconds?: number
  sourceEndSeconds?: number
  startSeconds: number
  durationSeconds: number
  editedRangeGroupId?: string
  editedRangeIndex?: number
}

type StoredProject = {
  sources: Array<{ id: string; path: string; durationSeconds: number; fingerprint: string; name: string }>
  videoClips: Array<{ id: string; sourceId: string; sourceStartSeconds: number; sourceEndSeconds: number }>
  captions: StoredCaption[]
  scriptSegments?: Array<{ id: string; sourceId: string; sourceStartSeconds: number; sourceEndSeconds: number; text: string; translationText?: string; deleted?: boolean }>
  captionSourceRevision?: string
  captionReloadResolution?: unknown
  updatedAt: number
}

function formatSrtTime(seconds: number): string {
  const wholeSeconds = Math.floor(seconds)
  const milliseconds = Math.round((seconds - wholeSeconds) * 1000)
  return `00:00:${String(wholeSeconds).padStart(2, '0')},${String(milliseconds).padStart(3, '0')}`
}

function makeSrt(text: string): string {
  return `1\n${formatSrtTime(0)} --> ${formatSrtTime(1)}\n${text}\n`
}

function projectStats(project: StoredProject | null): {
  source: StoredCaption[]
  translation: StoredCaption[]
  uniqueIds: boolean
  sourceStarts: number[]
  translationStarts: number[]
} {
  const captions = project?.captions ?? []
  const source = captions.filter((caption) => caption.kind === 'source')
  const translation = captions.filter((caption) => caption.kind === 'translation')
  const ids = captions.map((caption) => `${caption.kind}:${caption.id}`)
  return {
    source,
    translation,
    uniqueIds: new Set(ids).size === ids.length,
    sourceStarts: source.map((caption) => caption.startSeconds).sort((left, right) => left - right),
    translationStarts: translation.map((caption) => caption.startSeconds).sort((left, right) => left - right)
  }
}

async function main(): Promise<void> {
  const smokeDirectory = await mkdtemp(join(tmpdir(), 'aivplayer-smoke-fragment-reload-'))
  const mediaPath = join(smokeDirectory, 'fragment-reload-smoke.mp4')
  const sourceSubtitlePath = join(smokeDirectory, 'fragment-reload-smoke.srt')
  const translatedSubtitlePath = join(smokeDirectory, 'fragment-reload-smoke.translated.srt')
  const smokeHomeDirectory = await mkdtemp(join(tmpdir(), 'aivplayer-smoke-fragment-reload-home-'))
  await copyFile(sourceMediaPath, mediaPath)
  await writeFile(sourceSubtitlePath, makeSrt('原文一'))
  await writeFile(translatedSubtitlePath, makeSrt('译文一'))
  let revisionMs = Date.now() + 2_000

  const touchSidecars = async (): Promise<void> => {
    revisionMs += 2_000
    await utimes(sourceSubtitlePath, new Date(revisionMs), new Date(revisionMs))
    revisionMs += 2_000
    await utimes(translatedSubtitlePath, new Date(revisionMs), new Date(revisionMs))
  }

  const app = await electron.launch({
    args: ['--no-sandbox', '--in-process-gpu', `--user-data-dir=${smokeHomeDirectory}`, 'out/main/index.js', mediaPath],
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
      throw new Error(`Fragment reload Smoke timed out waiting for the persisted editing project: ${JSON.stringify(await readStoredProject())}`)
    }

    await openEditor()
    await page.waitForFunction(() => {
      const entries = Object.values(JSON.parse(localStorage.getItem('aivplayer.editing-projects.v1') ?? '{}') as Record<string, StoredProject>)
      return entries[0]?.captions?.some((caption) => caption.kind === 'source') === true && entries[0]?.captions?.some((caption) => caption.kind === 'translation') === true
    }, null, { timeout: 10_000 })

    const prepared = await page.evaluate(() => {
      const entries = Object.entries(JSON.parse(localStorage.getItem('aivplayer.editing-projects.v1') ?? '{}') as Record<string, StoredProject>)
      const [storageKey, original] = entries[0] ?? []
      if (!storageKey || !original) throw new Error('Fragment reload Smoke could not find the initial project')
      const sourceCaption = original.captions.find((caption) => caption.kind === 'source')
      const translationCaption = original.captions.find((caption) => caption.kind === 'translation')
      if (!sourceCaption) throw new Error('Fragment reload Smoke could not find the source caption')
      const source = original.sources[0]
      const originalClip = original.videoClips[0]
      if (!source || !originalClip) throw new Error('Fragment reload Smoke could not find the source clip')
      const segment = {
        id: sourceCaption.id,
        sourceId: source.id,
        sourceStartSeconds: sourceCaption.sourceStartSeconds ?? 0,
        sourceEndSeconds: sourceCaption.sourceEndSeconds ?? 1,
        text: sourceCaption.text,
        ...(translationCaption ? { translationText: translationCaption.text } : {}),
        deleted: true
      }
      const project: StoredProject = {
        ...original,
        videoClips: [
          { ...originalClip, id: 'fragment-clip-a', sourceStartSeconds: 0, sourceEndSeconds: 1 },
          { ...originalClip, id: 'fragment-clip-gap', sourceStartSeconds: 5, sourceEndSeconds: 6 },
          { ...originalClip, id: 'fragment-clip-b', sourceStartSeconds: 0, sourceEndSeconds: 1 }
        ],
        captions: [],
        scriptSegments: [segment],
        updatedAt: Date.now()
      }
      delete project.captionSourceRevision
      delete project.captionReloadResolution
      localStorage.setItem('aivplayer.editing-projects.v1', JSON.stringify({ [storageKey]: project }))
      return { segmentId: segment.id, sourceCaptionId: sourceCaption.id, translationCaptionId: translationCaption?.id ?? `translation-${sourceCaption.id}` }
    })

    await page.reload()
    await openEditor()
    await page.locator(`[data-testid="editing-script-restore-${prepared.segmentId}"]`).click()
    const restored = await waitForStored((project) => {
      const stats = projectStats(project)
      return stats.source.length === 2 && stats.translation.length === 2 && stats.uniqueIds && stats.sourceStarts.join(',') === '0,2' && stats.translationStarts.join(',') === '0,2'
    })

    const fragmentIdsBeforeReorder = projectStats(restored).source.concat(projectStats(restored).translation).map((caption) => caption.id).sort()
    const secondClip = page.locator('.editing-clip').nth(1)
    await secondClip.focus()
    await secondClip.press('ArrowLeft')
    const reordered = await waitForStored((project) => {
      const stats = projectStats(project)
      return project.videoClips[0]?.sourceStartSeconds === 5 && stats.source.length === 2 && stats.translation.length === 2 && stats.uniqueIds && stats.sourceStarts.join(',') === '1,2' && stats.translationStarts.join(',') === '1,2'
    })
    const fragmentIdsAfterReorder = projectStats(reordered).source.concat(projectStats(reordered).translation).map((caption) => caption.id).sort()
    const reorderPreservedIds = JSON.stringify(fragmentIdsBeforeReorder) === JSON.stringify(fragmentIdsAfterReorder)
    const reorderScreenshotPath = join(smokeHomeDirectory, 'aivplayer-smoke-fragment-reload-reorder.png')
    await page.screenshot({ path: reorderScreenshotPath, fullPage: false })

    await page.reload()
    await openEditor()
    const reopened = await waitForStored((project) => {
      const stats = projectStats(project)
      return stats.source.length === 2 && stats.translation.length === 2 && stats.uniqueIds && stats.sourceStarts.join(',') === '1,2'
    })
    const noFalseReopenConflict = await page.locator('[data-testid="editing-caption-reload-conflict"]').count() === 0

    await writeFile(sourceSubtitlePath, makeSrt('外部原文一'))
    await writeFile(translatedSubtitlePath, makeSrt('外部译文一'))
    await touchSidecars()
    await page.reload()
    await openEditor()
    await page.locator('[data-testid="editing-caption-reload-conflict"]').waitFor({ timeout: 10_000 })
    const reloadRows = page.locator('.editing-caption-reload-row')
    const reloadRowCount = await reloadRows.count()
    const removedRowCount = await page.locator('.editing-caption-reload-row.is-removed').count()
    const reloadScreenshotPath = join(smokeHomeDirectory, 'aivplayer-smoke-fragment-reload-conflict.png')
    await page.screenshot({ path: reloadScreenshotPath, fullPage: false })
    await page.locator('[data-testid="editing-caption-reload-preview"] summary').click()
    await page.locator(`[data-testid="editing-caption-reload-accept-source-${prepared.sourceCaptionId}"]`).click()
    await page.locator(`[data-testid="editing-caption-reload-accept-translation-${prepared.translationCaptionId}"]`).click()
    const refreshed = await waitForStored((project) => {
      const stats = projectStats(project)
      return stats.source.length === 2 && stats.translation.length === 2 && stats.uniqueIds && stats.source.every((caption) => caption.text === '外部原文一') && stats.translation.every((caption) => caption.text === '外部译文一')
    })
    const refreshConflictCleared = await page.locator('[data-testid="editing-caption-reload-conflict"]').count() === 0
    const finalScreenshotPath = join(smokeHomeDirectory, 'aivplayer-smoke-fragment-reload-final.png')
    await page.screenshot({ path: finalScreenshotPath, fullPage: false })
    const result = {
      restored: projectStats(restored),
      reordered: projectStats(reordered),
      reopened: projectStats(reopened),
      refreshed: projectStats(refreshed),
      reorderPreservedIds,
      noFalseReopenConflict,
      reloadRowCount,
      removedRowCount,
      refreshConflictCleared,
      consoleErrors,
      screenshots: { reorderScreenshotPath, reloadScreenshotPath, finalScreenshotPath }
    }
    console.log('AIVPlayer Smoke Editing Fragment Reload')
    console.log(JSON.stringify(result))

    if (result.restored.source.length !== 2 || result.restored.translation.length !== 2 || !result.restored.uniqueIds) process.exitCode = 1
    if (!result.reorderPreservedIds || result.reordered.sourceStarts.join(',') !== '1,2' || result.reordered.translationStarts.join(',') !== '1,2') process.exitCode = 1
    if (!result.noFalseReopenConflict || result.reopened.source.length !== 2 || result.reopened.translation.length !== 2) process.exitCode = 1
    if (result.reloadRowCount !== 2 || result.removedRowCount !== 0 || !result.refreshConflictCleared) process.exitCode = 1
    if (result.refreshed.source.some((caption) => caption.text !== '外部原文一') || result.refreshed.translation.some((caption) => caption.text !== '外部译文一')) process.exitCode = 1
    if (result.consoleErrors.length > 0) process.exitCode = 1
  } finally {
    await app.close()
  }
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
