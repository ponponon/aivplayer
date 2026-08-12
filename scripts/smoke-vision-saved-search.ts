import { execFile } from 'node:child_process'
import { mkdtemp, rm } from 'node:fs/promises'
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
  page.on('console', (message) => { if (message.type() === 'error') errors.push(`console: ${message.text()}`) })
  page.on('pageerror', (error) => errors.push(`page: ${error.message}`))
  await page.waitForLoadState('domcontentloaded')
  await page.locator('video.video-surface').waitFor({ timeout: 15_000 })
  return { app, page, errors }
}

async function openVisionPanel(page: Page): Promise<void> {
  await page.getByRole('tab', { name: '影视库搜索' }).click()
  await page.locator('.vision-panel').waitFor({ timeout: 10_000 })
}

async function waitForIndex(page: Page): Promise<{ indexedFrameCount: number; status: string }> {
  await page.waitForFunction(() => {
    const button = document.querySelector('.vision-intro > .vision-index-actions .vision-primary-action') as HTMLButtonElement | null
    return Boolean(button && !button.disabled)
  }, undefined, { timeout: 15_000 })
  await page.evaluate(() => {
    const smokeWindow = window as typeof window & { __visionSavedSearchProgress?: { current?: unknown; terminal?: unknown } }
    smokeWindow.__visionSavedSearchProgress = {}
    window.aiv.onVisionIndexProgress((progress) => {
      const state = smokeWindow.__visionSavedSearchProgress ?? {}
      state.current = progress
      if (progress.status === 'completed' || progress.status === 'error' || progress.status === 'cancelled') state.terminal = progress
      smokeWindow.__visionSavedSearchProgress = state
    })
  })
  await page.locator('.vision-intro > .vision-index-actions .vision-primary-action').click()
  await page.waitForFunction(() => {
    const progress = (window as typeof window & { __visionSavedSearchProgress?: { terminal?: { status?: string } } }).__visionSavedSearchProgress
    return progress?.terminal?.status === 'completed' || progress?.terminal?.status === 'error' || progress?.terminal?.status === 'cancelled'
  }, undefined, { timeout: 120_000 })
  const status = await page.evaluate(() => window.aiv.getVisionStatus())
  if (!status.indexedFrameCount) throw new Error(`Saved search smoke indexed no frames: ${JSON.stringify(status)}`)
  const progress = await page.evaluate(() => (window as typeof window & { __visionSavedSearchProgress?: { terminal?: { status?: string } } }).__visionSavedSearchProgress?.terminal)
  if (progress?.status !== 'completed') throw new Error(`Saved search smoke indexing failed: ${JSON.stringify({ progress, status })}`)
  return { indexedFrameCount: status.indexedFrameCount, status: progress.status }
}

async function runSearch(page: Page, query: string): Promise<number> {
  const input = page.locator('.vision-text-search input')
  await input.fill(query)
  await page.locator('.vision-text-search .vision-search-button').click()
  await page.locator('.vision-result-row').first().waitFor({ timeout: 30_000 })
  return page.locator('.vision-result-row').count()
}

async function runSmoke(): Promise<void> {
  const smokeDirectory = await mkdtemp(join(tmpdir(), 'aivplayer-smoke-vision-saved-search-'))
  const userDataDirectory = await mkdtemp(join(tmpdir(), 'aivplayer-smoke-vision-saved-search-user-data-'))
  const mediaPath = join(smokeDirectory, 'saved-search-smoke.mp4')
  const searchName = `保存搜索 Smoke ${Date.now()}`
  const searchQuery = 'saved-search-smoke'
  let firstApp: ElectronApplication | null = null
  let secondApp: ElectronApplication | null = null

  try {
    await createVideo(mediaPath)
    const firstSession = await launchPlayer(userDataDirectory, mediaPath)
    firstApp = firstSession.app
    await openVisionPanel(firstSession.page)
    const index = await waitForIndex(firstSession.page)
    const initialResultCount = await runSearch(firstSession.page, searchQuery)

    const nameInput = firstSession.page.locator('.vision-saved-search-name-input')
    await nameInput.fill(searchName)
    await firstSession.page.getByRole('button', { name: '保存搜索' }).click()
    const savedSearchButton = firstSession.page.locator('.vision-saved-search-button').filter({ hasText: searchName })
    await savedSearchButton.waitFor({ timeout: 10_000 })

    const savedSearches = await firstSession.page.evaluate(() => window.aiv.listVisionSavedSearches())
    const persistedSearch = savedSearches.find((item) => item.query === 'saved-search-smoke')
    if (!persistedSearch || persistedSearch.name !== searchName || persistedSearch.mode !== 'hybrid' || persistedSearch.evidenceTypes.length !== 0) {
      throw new Error(`Saved search was not persisted from UI: ${JSON.stringify({ savedSearches, searchName })}`)
    }

    await savedSearchButton.click()
    await firstSession.page.locator('.vision-result-row').first().waitFor({ timeout: 30_000 })
    const rerunQuery = await firstSession.page.locator('.vision-text-search input').inputValue()
    if (rerunQuery !== searchQuery) throw new Error(`Saved search rerun did not restore query: ${rerunQuery}`)

    console.log(`Saved search created and rerun: ${JSON.stringify({ name: persistedSearch.name, query: persistedSearch.query, initialResultCount })}`)
    await firstApp.close()
    firstApp = null

    const secondSession = await launchPlayer(userDataDirectory, mediaPath)
    secondApp = secondSession.app
    await openVisionPanel(secondSession.page)
    const restoredButton = secondSession.page.locator('.vision-saved-search-button').filter({ hasText: searchName })
    await restoredButton.waitFor({ timeout: 10_000 })
    const restoredSearches = await secondSession.page.evaluate(() => window.aiv.listVisionSavedSearches())
    const restoredSearch = restoredSearches.find((item) => item.name === searchName)
    if (!restoredSearch || restoredSearch.query !== searchQuery || restoredSearch.mode !== 'hybrid') {
      throw new Error(`Saved search did not survive restart: ${JSON.stringify({ restoredSearches, searchName })}`)
    }
    await restoredButton.click()
    await secondSession.page.locator('.vision-result-row').first().waitFor({ timeout: 30_000 })
    const restoredQuery = await secondSession.page.locator('.vision-text-search input').inputValue()
    if (restoredQuery !== searchQuery) throw new Error(`Restored saved search did not rerun: ${restoredQuery}`)

    const rendererErrors = [...firstSession.errors, ...secondSession.errors]
    if (rendererErrors.length > 0) throw new Error(`Renderer errors during saved search smoke:\n${rendererErrors.join('\n')}`)
    console.log(`AIVPlayer Smoke Vision Saved Search passed: ${JSON.stringify({ indexedFrameCount: index.indexedFrameCount, saved: true, rerun: true, restartRestored: true })}`)
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
