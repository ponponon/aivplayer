import { execFile } from 'node:child_process'
import { mkdtemp, rm, utimes } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { promisify } from 'node:util'
import { _electron as electron, type ElectronApplication, type Page } from 'playwright'

const execFileAsync = promisify(execFile)
const sourceImagePath = process.argv[2] ?? '/Users/ponponon/Pictures/loopy.jpg'

async function createVideo(outputPath: string): Promise<void> {
  await execFileAsync('ffmpeg', [
    '-hide_banner', '-loglevel', 'error', '-y',
    '-loop', '1', '-i', sourceImagePath,
    '-t', '4', '-vf', 'scale=640:-2,format=yuv420p',
    '-r', '2', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', outputPath
  ], { maxBuffer: 4 * 1024 * 1024 })
}

async function launchPlayer(userDataDirectory: string, mediaPath: string): Promise<{ app: ElectronApplication; page: Page; errors: string[] }> {
  const app = await electron.launch({
    args: ['--no-sandbox', '--in-process-gpu', `--user-data-dir=${userDataDirectory}`, 'out/main/index.js', mediaPath],
    env: { ...process.env, HOME: userDataDirectory }
  })
  const page = await app.firstWindow()
  const errors: string[] = []
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(`console: ${message.text()}`)
  })
  page.on('pageerror', (error) => errors.push(`page: ${error.message}`))
  await page.waitForLoadState('domcontentloaded')
  await page.evaluate(() => {
    const smokeWindow = window as typeof window & { __visionCustomEntityProgress?: unknown }
    smokeWindow.__visionCustomEntityProgress = null
    window.aiv.onVisionIndexProgress((progress) => { smokeWindow.__visionCustomEntityProgress = progress })
  })
  await page.locator('video.video-surface').waitFor({ timeout: 15_000 })
  return { app, page, errors }
}

async function openVisionPanel(page: Page): Promise<void> {
  await page.getByRole('tab', { name: '影视库搜索' }).click()
  await page.locator('.vision-panel').waitFor({ timeout: 10_000 })
  await page.locator('.vision-entity-catalog-create').waitFor({ timeout: 10_000 })
}

async function runSmoke(): Promise<void> {
  const smokeDirectory = await mkdtemp(join(tmpdir(), 'aivplayer-smoke-vision-custom-entity-'))
  const userDataDirectory = await mkdtemp(join(tmpdir(), 'aivplayer-smoke-vision-custom-entity-user-data-'))
  const mediaPath = join(smokeDirectory, 'loopy-entity.mp4')
  const customName = `Loopy 实体 ${Date.now()}`
  let firstApp: ElectronApplication | null = null
  let secondApp: ElectronApplication | null = null

  try {
    await createVideo(mediaPath)
    const firstSession = await launchPlayer(userDataDirectory, mediaPath)
    firstApp = firstSession.app
    await openVisionPanel(firstSession.page)
    const createForm = firstSession.page.locator('.vision-entity-catalog-create')
    await createForm.locator('input').nth(0).fill(customName)
    await createForm.locator('input').nth(1).fill('a cartoon character')
    await createForm.locator('input').nth(2).fill('loopy, mascot')
    await createForm.locator('button[type="submit"]').click()
    await firstSession.page.locator('.vision-entity-catalog-row .vision-entity-catalog-meta > strong').filter({ hasText: customName }).waitFor({ timeout: 10_000 })

    const createdCatalog = await firstSession.page.evaluate(() => window.aiv.getVisionEntityCatalog())
    const createdEntry = createdCatalog.entries.find((entry) => entry.name.startsWith('Loopy 实体'))
    if (!createdEntry || createdEntry.kind !== 'custom' || createdEntry.query !== 'a cartoon character') {
      throw new Error(`Custom entity was not persisted: ${JSON.stringify(createdCatalog)}`)
    }
    console.log(`Custom entity created: ${JSON.stringify({ labelId: createdEntry.labelId, name: createdEntry.name, query: createdEntry.query })}`)

    await firstApp.close()
    firstApp = null

    const secondSession = await launchPlayer(userDataDirectory, mediaPath)
    secondApp = secondSession.app
    await openVisionPanel(secondSession.page)
    await secondSession.page.locator('.vision-entity-catalog-row .vision-entity-catalog-meta > strong').filter({ hasText: customName }).waitFor({ timeout: 10_000 })
    const restoredCatalog = await secondSession.page.evaluate(() => window.aiv.getVisionEntityCatalog())
    const restoredEntry = restoredCatalog.entries.find((entry) => entry.name === customName)
    if (!restoredEntry) throw new Error(`Custom entity did not survive restart: ${JSON.stringify(restoredCatalog)}`)

    await secondSession.page.waitForFunction(() => {
      const progress = (window as typeof window & { __visionCustomEntityProgress?: { status?: string } }).__visionCustomEntityProgress
      return progress?.status === 'completed' || progress?.status === 'error' || progress?.status === 'cancelled'
    }, undefined, { timeout: 120_000 })
    const changedMtime = new Date(Date.now() + 1_000)
    await utimes(mediaPath, changedMtime, changedMtime)

    await secondSession.page.waitForFunction(() => {
      const button = document.querySelector('.vision-intro > .vision-index-actions .vision-primary-action') as HTMLButtonElement | null
      return Boolean(button && !button.disabled)
    }, undefined, { timeout: 15_000 })
    await secondSession.page.evaluate(() => {
      const smokeWindow = window as typeof window & { __visionCustomEntityProgress?: unknown }
      smokeWindow.__visionCustomEntityProgress = null
    })
    await secondSession.page.locator('.vision-intro > .vision-index-actions input[type="checkbox"]').nth(1).check()
    await secondSession.page.locator('.vision-intro > .vision-index-actions .vision-primary-action').click()
    await secondSession.page.waitForFunction(() => {
      const progress = (window as typeof window & { __visionCustomEntityProgress?: { status?: string } }).__visionCustomEntityProgress
      return progress?.status === 'completed' || progress?.status === 'error' || progress?.status === 'cancelled'
    }, undefined, { timeout: 180_000 })

    const diagnostics = await secondSession.page.evaluate(async () => ({
      progress: (window as typeof window & { __visionCustomEntityProgress?: unknown }).__visionCustomEntityProgress,
      status: await window.aiv.getVisionStatus()
    }))
    const progress = diagnostics.progress as { status?: string; processedFrames?: number; skippedVideos?: number; entityEvidenceCount?: number } | null
    if (progress?.status !== 'completed' || !diagnostics.status.indexedFrameCount || !progress.processedFrames || progress.skippedVideos !== 0 || !progress.entityEvidenceCount) {
      throw new Error(`Custom entity indexing did not complete: ${JSON.stringify(diagnostics)}`)
    }

    const results = await secondSession.page.evaluate((query) => window.aiv.searchVisionText({ query, limit: 24, mode: 'hybrid' }), customName)
    const entityResult = results.find((result) => result.evidenceType === 'entity' && result.matchedText === customName)
    if (!entityResult) throw new Error(`Custom entity search did not return an entity evidence row: ${JSON.stringify({ diagnostics, results })}`)
    console.log(`Custom entity indexed and searchable: ${JSON.stringify({ labelId: restoredEntry.labelId, entityEvidenceCount: progress?.entityEvidenceCount ?? null, result: entityResult })}`)

    const rendererErrors = [...firstSession.errors, ...secondSession.errors]
    if (rendererErrors.length > 0) throw new Error(`Renderer errors during custom entity smoke:\n${rendererErrors.join('\n')}`)
    console.log(`AIVPlayer Smoke Vision Custom Entity passed for ${mediaPath}`)
  } finally {
    if (secondApp) await secondApp.close().catch(() => undefined)
    if (firstApp) await firstApp.close().catch(() => undefined)
    await rm(smokeDirectory, { recursive: true, force: true }).catch(() => undefined)
    await rm(userDataDirectory, { recursive: true, force: true }).catch(() => undefined)
  }
}

runSmoke().catch((error) => {
  console.error(error instanceof Error ? error.stack ?? error.message : String(error))
  process.exitCode = 1
})
