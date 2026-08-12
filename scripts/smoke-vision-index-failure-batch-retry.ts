import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { _electron as electron, type ElectronApplication, type Page } from 'playwright'

const mediaPath = process.argv[2] ?? '/Users/ponponon/Music/aivplayer_test_video_1min.mp4'

type FailureFixture = {
  mediaPath: string
  fileName: string
  error: string
  failedAt: number
  lastAttemptAt: number
  retryCount: number
  intervalSeconds: number
  includeSceneEvidence: boolean
  includeEntityEvidence: boolean
  includeObjectEvidence: boolean
  stage: 'frames' | 'scene-evidence' | 'entity-evidence' | 'object-evidence' | 'error'
}

function failureFixture(userDataDirectory: string, name: string, options: Pick<FailureFixture, 'intervalSeconds' | 'includeSceneEvidence' | 'includeEntityEvidence' | 'includeObjectEvidence' | 'stage'>, offset: number): FailureFixture {
  const now = Date.now() - 5_000 + offset
  return {
    mediaPath: join(userDataDirectory, `${name}.mp4`),
    fileName: `${name}.mp4`,
    error: `Smoke 失败 ${name}`,
    failedAt: now,
    lastAttemptAt: now,
    retryCount: 0,
    ...options
  }
}

async function launchPlayer(userDataDirectory: string): Promise<{ app: ElectronApplication; page: Page; errors: string[] }> {
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

async function waitForRetryResults(page: Page, expectedNames: readonly string[]): Promise<FailureFixture[]> {
  await page.waitForFunction((names) => {
    const records = (window as typeof window & { aiv: { listVisionIndexFailures: () => Promise<FailureFixture[]> } }).aiv
    return records.listVisionIndexFailures().then((items) => names.every((name) => items.some((item) => item.fileName === name && item.retryCount >= 1)))
  }, expectedNames, { timeout: 60_000 })
  return page.evaluate(() => window.aiv.listVisionIndexFailures()) as Promise<FailureFixture[]>
}

async function runSmoke(): Promise<void> {
  const userDataDirectory = await mkdtemp(join(tmpdir(), 'aivplayer-smoke-vision-index-failure-batch-retry-'))
  const failureDirectory = join(userDataDirectory, 'library')
  const failurePath = join(failureDirectory, 'vision-index-failures.json')
  let firstApp: ElectronApplication | null = null
  let secondApp: ElectronApplication | null = null
  const expectedNames = ['smoke-failure-scene.mp4', 'smoke-failure-entity.mp4']

  try {
    await mkdir(failureDirectory, { recursive: true })
    const records = [
      failureFixture(userDataDirectory, 'smoke-failure-scene', { intervalSeconds: 5, includeSceneEvidence: true, includeEntityEvidence: false, includeObjectEvidence: false, stage: 'scene-evidence' }, 0),
      failureFixture(userDataDirectory, 'smoke-failure-entity', { intervalSeconds: 11, includeSceneEvidence: false, includeEntityEvidence: true, includeObjectEvidence: true, stage: 'entity-evidence' }, 1)
    ]
    await writeFile(failurePath, JSON.stringify({ schemaVersion: 1, records }, null, 2), { encoding: 'utf8', mode: 0o600 })

    const firstSession = await launchPlayer(userDataDirectory)
    firstApp = firstSession.app
    const page = firstSession.page
    await page.getByRole('tab', { name: '影视库搜索' }).click()
    const failures = page.locator('.vision-index-failures')
    await failures.waitFor({ timeout: 15_000 })
    await page.waitForFunction((names) => names.every((name) => Array.from(document.querySelectorAll('.vision-index-failure strong')).some((node) => node.textContent === name)), expectedNames, { timeout: 15_000 })

    await failures.locator('input[type="checkbox"][aria-label*="smoke-failure-scene.mp4"]').check()
    await failures.locator('input[type="checkbox"][aria-label*="smoke-failure-entity.mp4"]').check()
    await failures.getByRole('button', { name: /批量重试/ }).click()
    const retriedRecords = await waitForRetryResults(page, expectedNames)
    const scene = retriedRecords.find((record) => record.fileName === 'smoke-failure-scene.mp4')
    const entity = retriedRecords.find((record) => record.fileName === 'smoke-failure-entity.mp4')
    if (!scene || !entity) throw new Error(`Batch retry records disappeared: ${JSON.stringify(retriedRecords)}`)
    if (scene.retryCount !== 1 || scene.intervalSeconds !== 5 || !scene.includeSceneEvidence || scene.includeEntityEvidence || scene.includeObjectEvidence) {
      throw new Error(`Scene retry configuration was not preserved: ${JSON.stringify(scene)}`)
    }
    if (entity.retryCount !== 1 || entity.intervalSeconds !== 11 || entity.includeSceneEvidence || !entity.includeEntityEvidence || !entity.includeObjectEvidence) {
      throw new Error(`Entity retry configuration was not preserved: ${JSON.stringify(entity)}`)
    }
    if (firstSession.errors.length > 0) throw new Error(`Renderer errors during vision failure batch retry smoke:\n${firstSession.errors.join('\n')}`)

    await firstApp.close()
    firstApp = null
    const secondSession = await launchPlayer(userDataDirectory)
    secondApp = secondSession.app
    await secondSession.page.getByRole('tab', { name: '影视库搜索' }).click()
    await secondSession.page.locator('.vision-index-failures').waitFor({ timeout: 15_000 })
    const restored = await secondSession.page.evaluate(() => window.aiv.listVisionIndexFailures())
    if (restored.length !== 2 || restored.some((record) => record.retryCount !== 1)) throw new Error(`Batch retry records were not restored after restart: ${JSON.stringify(restored)}`)
    if (secondSession.errors.length > 0) throw new Error(`Renderer errors after vision failure restart:\n${secondSession.errors.join('\n')}`)
    const persistedManifest = JSON.parse(await readFile(failurePath, 'utf8')) as { records: FailureFixture[] }
    if (persistedManifest.records.length !== 2 || persistedManifest.records.some((record) => record.retryCount !== 1)) throw new Error(`Failure manifest was not persisted after batch retry: ${JSON.stringify(persistedManifest)}`)
    console.log(`AIVPlayer Smoke Vision Index Failure Batch Retry passed: ${JSON.stringify({ retried: expectedNames, configurationIsolated: true, restartRestored: true })}`)
  } finally {
    if (secondApp) await secondApp.close().catch(() => undefined)
    if (firstApp) await firstApp.close().catch(() => undefined)
    await rm(userDataDirectory, { recursive: true, force: true }).catch(() => undefined)
  }
}

runSmoke().catch((error) => {
  console.error(error instanceof Error ? error.stack ?? error.message : String(error))
  process.exitCode = 1
})
