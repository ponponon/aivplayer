import { createHash } from 'node:crypto'
import { copyFile, mkdtemp, rm, stat, unlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join, normalize, resolve, basename } from 'node:path'
import { _electron as electron, type ElectronApplication, type Page } from 'playwright'

const mediaPath = process.argv[2] ?? '/Users/ponponon/Music/aivplayer_test_video_1min.mp4'

const copyByLocale = {
  'zh-CN': { visionTitle: '影视库搜索' },
  'en-US': { visionTitle: 'Video library search' },
  'ja-JP': { visionTitle: '動画ライブラリ検索' },
  'ko-KR': { visionTitle: '영상 라이브러리 검색' }
} as const

type SmokeCopy = (typeof copyByLocale)[keyof typeof copyByLocale]

function getCopy(locale: string): SmokeCopy {
  return copyByLocale[locale as keyof typeof copyByLocale] ?? copyByLocale['zh-CN']
}

async function createInboxFile(path: string): Promise<{ path: string; fileName: string; directoryPath: string; sizeBytes: number; mtimeMs: number }> {
  const file = await stat(path)
  return {
    path,
    fileName: basename(path),
    directoryPath: dirname(path),
    sizeBytes: file.size,
    mtimeMs: file.mtimeMs
  }
}

function getMediaImportInboxItemId(filePath: string): string {
  const normalizedPath = normalize(resolve(filePath))
  return createHash('sha256').update(process.platform === 'win32' ? normalizedPath.toLowerCase() : normalizedPath).digest('hex').slice(0, 32)
}

async function seedInbox(userDataDirectory: string): Promise<{ importDirectory: string; paths: Record<'ignored' | 'missing' | 'ready', string> }> {
  const importDirectory = await mkdtemp(join(tmpdir(), 'aivplayer-smoke-import-inbox-files-'))
  const paths = {
    ignored: join(importDirectory, 'ignored.mp4'),
    missing: join(importDirectory, 'missing.mp4'),
    ready: join(importDirectory, 'ready.mp4')
  } as const
  await Promise.all(Object.values(paths).map((path) => copyFile(mediaPath, path)))

  const now = Date.now()
  const files = await Promise.all(Object.values(paths).map(createInboxFile))
  await unlink(paths.missing)
  const items = files.map((file, index) => ({
    ...file,
    id: getMediaImportInboxItemId(file.path),
    status: file.path === paths.ignored ? 'ignored' : file.path === paths.missing ? 'missing' : 'ready',
    discoveredAt: now,
    updatedAt: now + index,
    metadata: { tags: [], favorite: false, note: '', source: null, projectId: null },
    pipeline: { metadata: 'ready', subtitle: 'ready', vision: 'ready' }
  }))
  await writeFile(join(userDataDirectory, 'media-import-inbox.json'), `${JSON.stringify({ schemaVersion: 1, items }, null, 2)}\n`, { encoding: 'utf8', mode: 0o600 })
  return { importDirectory, paths }
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

async function openInbox(page: Page): Promise<void> {
  const locale = await page.evaluate(() => window.aiv.getAppSettings().then((settings) => settings.ui.locale))
  const copy = getCopy(locale)
  await page.getByRole('tab', { name: copy.visionTitle }).click()
  await page.locator('.vision-import-inbox').waitFor({ timeout: 10_000 })
}

async function runSmoke(): Promise<void> {
  const userDataDirectory = await mkdtemp(join(tmpdir(), 'aivplayer-smoke-vision-import-inbox-batch-clear-user-data-'))
  let importDirectory = ''
  let firstApp: ElectronApplication | null = null
  let secondApp: ElectronApplication | null = null

  try {
    const seeded = await seedInbox(userDataDirectory)
    importDirectory = seeded.importDirectory
    const firstSession = await launchPlayer(userDataDirectory)
    firstApp = firstSession.app
    const firstPage = firstSession.page
    await openInbox(firstPage)
    await firstPage.waitForFunction(() => document.querySelectorAll('.vision-inbox-item').length === 3, undefined, { timeout: 15_000 })

    const illegalBatch = await firstPage.evaluate(async () => {
      const before = await window.aiv.listMediaImportInbox()
      const ignored = before.find((item) => item.status === 'ignored')
      const ready = before.find((item) => item.status === 'ready')
      if (!ignored || !ready) throw new Error(`Seeded terminal states are missing: ${JSON.stringify(before)}`)
      const result = await window.aiv.transitionMediaImportInboxBatch({ itemIds: [ignored.id, ready.id], action: 'clear' })
      const after = await window.aiv.listMediaImportInbox()
      return { result, statuses: after.map((item) => ({ fileName: item.fileName, status: item.status })) }
    })
    if (illegalBatch.result !== null || illegalBatch.statuses.length !== 3 || !illegalBatch.statuses.some((item) => item.status === 'ready')) {
      throw new Error(`Illegal mixed clear was not rejected without mutation: ${JSON.stringify(illegalBatch)}`)
    }

    await firstPage.locator('input[type="checkbox"][aria-label*="ignored.mp4"]').check()
    await firstPage.locator('input[type="checkbox"][aria-label*="missing.mp4"]').check()
    const batchButtons = firstPage.locator('.vision-inbox-batch-toolbar button')
    await batchButtons.last().click()
    await firstPage.waitForFunction(() => document.querySelectorAll('.vision-inbox-item').length === 1, undefined, { timeout: 15_000 })
    const firstState = await firstPage.evaluate(() => window.aiv.listMediaImportInbox())
    if (firstState.length !== 1 || firstState[0]?.status !== 'ready' || firstState[0]?.fileName !== 'ready.mp4') {
      throw new Error(`Batch clear left an unexpected manifest: ${JSON.stringify(firstState)}`)
    }
    if (await stat(seeded.paths.ignored).then(() => true, () => false) !== true || await stat(seeded.paths.ready).then(() => true, () => false) !== true) {
      throw new Error('Batch clear removed an original media file')
    }
    if (await stat(seeded.paths.missing).then(() => true, () => false) !== false) throw new Error('Missing fixture unexpectedly exists')
    if (firstSession.errors.length > 0) throw new Error(`Renderer errors during inbox batch clear smoke:\n${firstSession.errors.join('\n')}`)

    await firstApp.close()
    firstApp = null
    const secondSession = await launchPlayer(userDataDirectory)
    secondApp = secondSession.app
    await openInbox(secondSession.page)
    await secondSession.page.waitForFunction(() => document.querySelectorAll('.vision-inbox-item').length === 1, undefined, { timeout: 15_000 })
    const restored = await secondSession.page.evaluate(() => window.aiv.listMediaImportInbox())
    if (restored.length !== 1 || restored[0]?.status !== 'ready' || restored[0]?.fileName !== 'ready.mp4') {
      throw new Error(`Cleared inbox manifest was not restored after restart: ${JSON.stringify(restored)}`)
    }
    if (secondSession.errors.length > 0) throw new Error(`Renderer errors after inbox restart:\n${secondSession.errors.join('\n')}`)
    console.log(`AIVPlayer Smoke Vision Import Inbox Batch Clear passed: ${JSON.stringify({ illegalBatchRejected: illegalBatch.result === null, remaining: restored.map((item) => item.fileName), mediaPreserved: true })}`)
  } finally {
    if (secondApp) await secondApp.close().catch(() => undefined)
    if (firstApp) await firstApp.close().catch(() => undefined)
    if (importDirectory) await rm(importDirectory, { recursive: true, force: true }).catch(() => undefined)
    await rm(userDataDirectory, { recursive: true, force: true }).catch(() => undefined)
  }
}

runSmoke().catch((error) => {
  console.error(error instanceof Error ? error.stack ?? error.message : String(error))
  process.exitCode = 1
})
