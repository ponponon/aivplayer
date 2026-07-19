import { mkdtemp, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { basename, join } from 'node:path'
import { _electron as electron } from 'playwright'

async function main(): Promise<void> {
  const smokeHomeDirectory = await mkdtemp(join(tmpdir(), 'aivplayer-smoke-playback-history-home-'))
  const smokeUserDataDirectory = await mkdtemp(join(tmpdir(), 'aivplayer-smoke-playback-history-user-data-'))
  const missingOlderPath = join(smokeHomeDirectory, 'missing-older.mp4')
  const missingNewerPath = join(smokeHomeDirectory, 'missing-newer.mp4')
  const availablePath = join(smokeHomeDirectory, 'available.mp4')
  await writeFile(availablePath, '')
  const app = await electron.launch({
    args: [`--user-data-dir=${smokeUserDataDirectory}`, 'out/main/index.js'],
    env: {
      ...process.env,
      HOME: smokeHomeDirectory
    }
  })
  const consoleErrors: string[] = []
  const pageErrors: string[] = []

  try {
    const page = await app.firstWindow()
    page.on('console', (message) => {
      if (message.type() === 'error') consoleErrors.push(message.text())
      console.log(`[renderer:${message.type()}] ${message.text()}`)
    })
    page.on('pageerror', (error) => {
      pageErrors.push(error.message)
      console.log(`[renderer:error] ${error.message}`)
    })

    await page.waitForLoadState('domcontentloaded')
    await page.waitForSelector('#root', { timeout: 10_000 })

    const settings = await page.evaluate(() => window.aiv.getAppSettings())
    settings.playback.history = [
      { path: missingNewerPath, name: basename(missingNewerPath), extension: 'mp4', lastPlayedAt: 200, durationSeconds: 600 },
      { path: missingOlderPath, name: basename(missingOlderPath), extension: 'mp4', lastPlayedAt: 100, durationSeconds: null },
      { path: availablePath, name: basename(availablePath), extension: 'mp4', lastPlayedAt: 50, durationSeconds: null }
    ]
    settings.playback.lastProgressByPath = { [missingNewerPath]: 124 }
    await page.evaluate(async (nextSettings) => window.aiv.setAppSettings(nextSettings), settings)
    await page.reload({ waitUntil: 'domcontentloaded' })

    await page.evaluate(() => window.aiv.getAppSettings())
    const historyButton = page.locator('.panel-content-playlist .panel-header-actions .panel-header-action').first()
    await historyButton.waitFor({ timeout: 10_000 })
    await page.locator('.history-count').waitFor({ timeout: 10_000 })

    if (await page.locator('.history-count').textContent() !== '3') {
      throw new Error('Playback history badge does not show three records')
    }

    await historyButton.click()
    await page.locator('.playlist.is-history').waitFor({ timeout: 10_000 })
    await page.locator('.history-item').nth(1).waitFor({ timeout: 10_000 })
    await page.waitForFunction(() => document.querySelectorAll('.history-item.is-unavailable').length === 2)

    const progressFill = page.locator('.history-item').first().locator('.history-progress-fill')
    await progressFill.waitFor({ timeout: 10_000 })
    const progressWidth = await progressFill.evaluate((node) => Number.parseFloat((node as HTMLElement).style.width))
    if (progressWidth < 20 || progressWidth > 21) {
      throw new Error(`Unexpected history progress width: ${progressWidth}`)
    }
    if (await page.locator('.history-item').nth(1).locator('.history-progress').count() !== 0) {
      throw new Error('History row without a duration rendered a fake progress bar')
    }

    const historyScreenshotPath = join(smokeHomeDirectory, 'aivplayer-smoke-playback-history.png')
    await page.screenshot({ path: historyScreenshotPath, fullPage: false })

    await page.locator('.history-item').nth(2).locator('.history-item-main').click({ button: 'right' })
    await page.locator('.history-context-menu').waitFor({ timeout: 10_000 })
    if (await page.locator('.history-context-menu-item').count() !== 3 || await page.locator('.history-context-menu-item').first().isDisabled() || await page.locator('.history-context-menu-item').nth(1).isDisabled()) {
      throw new Error('Available history context menu did not expose its actions')
    }
    await page.keyboard.press('Escape')
    if (await page.locator('.history-context-menu').count() !== 0) {
      throw new Error('History context menu did not close with Escape')
    }

    const historyFilterButton = page.locator('.history-filter-button')
    await historyFilterButton.click()
    if (await historyFilterButton.getAttribute('aria-pressed') !== 'true' || await page.locator('.history-item').count() !== 1 || await page.locator('.history-item').first().locator('.history-name').textContent() !== 'missing-newer.mp4') {
      throw new Error('Unfinished playback history filter did not isolate the unfinished record')
    }
    await historyFilterButton.click()
    if (await historyFilterButton.getAttribute('aria-pressed') !== 'false' || await page.locator('.history-item').count() !== 3) {
      throw new Error('Playback history filter did not restore all records')
    }

    const unavailableText = await page.locator('.history-item.is-unavailable').first().locator('.history-meta').textContent()
    if (!unavailableText) {
      throw new Error(`Unexpected unavailable history label: ${unavailableText ?? '<empty>'}`)
    }

    await page.locator('.history-item-main').first().click()
    await page.waitForTimeout(150)
    if (await page.locator('video.video-surface').count() !== 0 || await page.locator('.history-item.is-unavailable').count() !== 2) {
      throw new Error('Clicking an unavailable history record changed the player state')
    }

    await page.locator('.history-remove').first().click()
    if (await page.locator('.history-item').count() !== 2) {
      throw new Error('Removing one history record did not update the list')
    }

    const unavailableCleanupButton = page.locator('.history-clear-unavailable-button')
    await unavailableCleanupButton.waitFor({ timeout: 10_000 })
    if (await unavailableCleanupButton.locator('.history-unavailable-count').textContent() !== '1') {
      throw new Error('Unavailable history count did not update after removing one record')
    }
    await unavailableCleanupButton.click()
    await page.waitForFunction(() => document.querySelectorAll('.history-item').length === 1)
    if (await page.locator('.history-item.is-unavailable').count() !== 0) {
      throw new Error('Cleaning unavailable history did not remove all invalid records')
    }

    await historyFilterButton.click()
    await page.locator('.playlist.is-history.is-empty .history-filter-reset').waitFor({ timeout: 10_000 })
    await page.locator('.history-filter-reset').click()
    if (await historyFilterButton.getAttribute('aria-pressed') !== 'false' || await page.locator('.history-item').count() !== 1) {
      throw new Error('Empty unfinished history state did not restore the remaining history')
    }

    await page.locator('.panel-header-action-danger').click()
    await page.locator('.playlist.is-history.is-empty .panel-empty').waitFor({ timeout: 10_000 })
    const clearedSettings = await page.evaluate(() => window.aiv.getAppSettings())
    if (clearedSettings.playback.history.length !== 0) {
      throw new Error('Clearing playback history was not persisted')
    }

    console.log('AIVPlayer Smoke Playback History')
    console.log(`History screenshot: ${historyScreenshotPath}`)
    console.log(`History records after clear: ${clearedSettings.playback.history.length}`)

    if (consoleErrors.length > 0 || pageErrors.length > 0) {
      throw new Error(`Renderer errors: ${JSON.stringify({ consoleErrors, pageErrors })}`)
    }
  } finally {
    await app.close()
  }
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
