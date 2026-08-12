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

async function waitForIndex(page: Page): Promise<number> {
  await page.waitForFunction(() => {
    const button = document.querySelector('.vision-intro > .vision-index-actions .vision-primary-action') as HTMLButtonElement | null
    return Boolean(button && !button.disabled)
  }, undefined, { timeout: 15_000 })
  await page.evaluate(() => {
    const smokeWindow = window as typeof window & { __visionSelectionProgress?: { terminal?: { status?: string } } }
    smokeWindow.__visionSelectionProgress = {}
    window.aiv.onVisionIndexProgress((progress) => {
      const state = smokeWindow.__visionSelectionProgress ?? {}
      if (progress.status === 'completed' || progress.status === 'error' || progress.status === 'cancelled') state.terminal = progress
      smokeWindow.__visionSelectionProgress = state
    })
  })
  await page.locator('.vision-intro > .vision-index-actions .vision-primary-action').click()
  await page.waitForFunction(() => {
    const progress = (window as typeof window & { __visionSelectionProgress?: { terminal?: { status?: string } } }).__visionSelectionProgress
    return progress?.terminal?.status === 'completed' || progress?.terminal?.status === 'error' || progress?.terminal?.status === 'cancelled'
  }, undefined, { timeout: 120_000 })
  const progress = await page.evaluate(() => (window as typeof window & { __visionSelectionProgress?: { terminal?: { status?: string; processedFrames?: number } } }).__visionSelectionProgress?.terminal)
  if (progress?.status !== 'completed' || !progress.processedFrames) throw new Error(`Vision selection smoke indexing failed: ${JSON.stringify(progress)}`)
  return progress.processedFrames
}

async function search(page: Page, query: string): Promise<number> {
  const input = page.locator('.vision-text-search input')
  const button = page.locator('.vision-text-search .vision-search-button')
  await input.fill(query)
  await button.click()
  await page.waitForFunction(() => (document.querySelector('.vision-text-search .vision-search-button') as HTMLButtonElement | null)?.disabled === true, undefined, { timeout: 10_000 })
  await page.waitForFunction(() => (document.querySelector('.vision-text-search .vision-search-button') as HTMLButtonElement | null)?.disabled === false, undefined, { timeout: 30_000 })
  await page.locator('.vision-result-row').first().waitFor({ timeout: 30_000 })
  return page.locator('.vision-result-row').count()
}

async function checkedResultCount(page: Page): Promise<number> {
  return page.locator('.vision-result-row input[type="checkbox"]:checked').count()
}

async function runSmoke(): Promise<void> {
  const smokeDirectory = await mkdtemp(join(tmpdir(), 'aivplayer-smoke-vision-search-selection-'))
  const userDataDirectory = await mkdtemp(join(tmpdir(), 'aivplayer-smoke-vision-search-selection-user-data-'))
  const mediaPath = join(smokeDirectory, 'vision-selection-smoke.mp4')
  let app: ElectronApplication | null = null

  try {
    await createVideo(mediaPath)
    const session = await launchPlayer(userDataDirectory, mediaPath)
    app = session.app
    await openVisionPanel(session.page)
    const indexedFrames = await waitForIndex(session.page)
    const initialResultCount = await search(session.page, 'vision-selection-smoke')
    const selectAllButton = session.page.getByRole('button', { name: '全选当前结果' })
    const clearButton = session.page.getByRole('button', { name: '清空当前选择' })

    await selectAllButton.click()
    const selectedAllCount = await checkedResultCount(session.page)
    if (selectedAllCount !== initialResultCount) throw new Error(`Vision result select-all mismatch: ${JSON.stringify({ initialResultCount, selectedAllCount })}`)

    await clearButton.click()
    const clearedCount = await checkedResultCount(session.page)
    if (clearedCount !== 0) throw new Error(`Vision result clear mismatch: ${JSON.stringify({ clearedCount })}`)

    await session.page.locator('.vision-result-row input[type="checkbox"]').first().check()
    const selectedOneCount = await checkedResultCount(session.page)
    if (selectedOneCount !== 1) throw new Error(`Vision result single selection mismatch: ${JSON.stringify({ selectedOneCount })}`)

    const secondResultCount = await search(session.page, 'selection-smoke')
    const clearedOnResearchCount = await checkedResultCount(session.page)
    if (secondResultCount < 1 || clearedOnResearchCount !== 0) throw new Error(`Vision result re-search did not clear selection: ${JSON.stringify({ secondResultCount, clearedOnResearchCount })}`)

    if (session.errors.length > 0) throw new Error(`Renderer errors during vision selection smoke:\n${session.errors.join('\n')}`)
    console.log(`AIVPlayer Smoke Vision Search Selection passed: ${JSON.stringify({ indexedFrames, initialResultCount, selectedAllCount, clearedCount, clearedOnResearch: clearedOnResearchCount })}`)
  } finally {
    if (app) await app.close().catch(() => undefined)
    await rm(smokeDirectory, { recursive: true, force: true }).catch(() => undefined)
    await rm(userDataDirectory, { recursive: true, force: true }).catch(() => undefined)
  }
}

runSmoke().catch((error) => {
  console.error(error instanceof Error ? error.stack ?? error.message : String(error))
  process.exitCode = 1
})
