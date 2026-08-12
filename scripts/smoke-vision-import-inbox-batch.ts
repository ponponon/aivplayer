import { createHash } from 'node:crypto'
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, normalize, resolve } from 'node:path'
import { _electron as electron, type ElectronApplication, type Page } from 'playwright'

const mediaPath = process.argv[2] ?? '/Users/ponponon/Music/aivplayer_test_video_1min.mp4'

type ObservedStatus = 'processing' | 'failed' | 'ignored' | 'queued'

const seedItems = [
  { fileName: 'batch-queue.mp4', status: 'discovered' as const, lastError: undefined },
  { fileName: 'batch-ignore-a.mp4', status: 'discovered' as const, lastError: undefined },
  { fileName: 'batch-ignore-b.mp4', status: 'discovered' as const, lastError: undefined },
  { fileName: 'batch-retry-failed.mp4', status: 'failed' as const, lastError: '上一次视觉索引失败' },
  { fileName: 'batch-retry-missing.mp4', status: 'missing' as const, lastError: undefined }
] as const

function getItemId(filePath: string): string {
  const normalizedPath = normalize(resolve(filePath))
  return createHash('sha256').update(process.platform === 'win32' ? normalizedPath.toLowerCase() : normalizedPath).digest('hex').slice(0, 32)
}

async function seedInbox(userDataDirectory: string): Promise<{ importDirectory: string; paths: Record<typeof seedItems[number]['fileName'], string> }> {
  const importDirectory = await mkdtemp(join(tmpdir(), 'aivplayer-smoke-import-inbox-batch-files-'))
  const now = Date.now()
  const paths = Object.fromEntries(seedItems.map((item) => [item.fileName, join(importDirectory, item.fileName)])) as Record<typeof seedItems[number]['fileName'], string>
  const items = seedItems.map((item, index) => ({
    path: paths[item.fileName],
    fileName: item.fileName,
    directoryPath: importDirectory,
    sizeBytes: 1024 + index,
    mtimeMs: now + index,
    id: getItemId(paths[item.fileName]),
    status: item.status,
    discoveredAt: now,
    updatedAt: now + index,
    metadata: { tags: [], favorite: false, note: '', source: null, projectId: null },
    pipeline: { metadata: item.status === 'failed' ? 'failed' : 'pending', subtitle: 'pending', vision: item.status === 'failed' ? 'failed' : 'pending' },
    ...(item.lastError ? { lastError: item.lastError } : {})
  }))
  await mkdir(join(userDataDirectory), { recursive: true })
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
  const title = locale === 'en-US' ? 'Video library search' : locale === 'ja-JP' ? '動画ライブラリ検索' : locale === 'ko-KR' ? '영상 라이브러리 검색' : '影视库搜索'
  await page.getByRole('tab', { name: title }).click()
  await page.locator('.vision-import-inbox').waitFor({ timeout: 10_000 })
  await page.waitForFunction(() => document.querySelectorAll('.vision-inbox-item').length === 5, undefined, { timeout: 15_000 })
}

async function armItemEvents(page: Page): Promise<void> {
  await page.evaluate(() => {
    const smokeWindow = window as typeof window & { __inboxBatchEvents?: Array<{ fileName: string; status: string }> }
    smokeWindow.__inboxBatchEvents = []
    window.aiv.onMediaImportInboxItemChanged((item) => {
      smokeWindow.__inboxBatchEvents?.push({ fileName: item.fileName, status: item.status })
    })
  })
}

async function itemStatus(page: Page, fileName: string): Promise<string | undefined> {
  const items = await page.evaluate(() => window.aiv.listMediaImportInbox())
  return items.find((item) => item.fileName === fileName)?.status
}

async function waitForPersistedStatuses(manifestPath: string, fileNames: string[], status: string): Promise<Array<{ fileName: string; status: string; lastError?: string }>> {
  const deadline = Date.now() + 30_000
  let latest: Array<{ fileName: string; status: string; lastError?: string }> = []
  while (Date.now() < deadline) {
    const manifest = JSON.parse(await readFile(manifestPath, 'utf8')) as { items?: Array<{ fileName: string; status: string; lastError?: string }> }
    latest = (manifest.items ?? []).filter((item) => fileNames.includes(item.fileName))
    if (latest.length === fileNames.length && latest.every((item) => item.status === status)) return latest
    await new Promise((resolve) => setTimeout(resolve, 100))
  }
  throw new Error(`收件箱 manifest 未在期限内完成持久化：${JSON.stringify(latest)}`)
}

async function waitForStatus(page: Page, fileNames: string[], status: ObservedStatus): Promise<void> {
  await page.waitForFunction(async ({ fileNames: names, expected }) => {
    const items = await window.aiv.listMediaImportInbox()
    return names.every((name) => items.find((item) => item.fileName === name)?.status === expected)
  }, { fileNames, expected: status }, { timeout: 30_000 })
}

async function selectItems(page: Page, fileNames: string[]): Promise<void> {
  for (const fileName of fileNames) await page.getByRole('checkbox', { name: `选择 ${fileName}`, exact: true }).check()
  await page.getByText(`已选择 ${fileNames.length} 项`, { exact: true }).waitFor({ timeout: 5_000 })
}

async function runSmoke(): Promise<void> {
  const userDataDirectory = await mkdtemp(join(tmpdir(), 'aivplayer-smoke-vision-import-inbox-batch-user-data-'))
  let importDirectory = ''
  let firstApp: ElectronApplication | null = null
  let secondApp: ElectronApplication | null = null

  try {
    const seeded = await seedInbox(userDataDirectory)
    importDirectory = seeded.importDirectory
    const firstSession = await launchPlayer(userDataDirectory)
    firstApp = firstSession.app
    await openInbox(firstSession.page)
    await armItemEvents(firstSession.page)

    await selectItems(firstSession.page, ['batch-queue.mp4'])
    await firstSession.page.getByRole('button', { name: '批量入队', exact: true }).click()
    await waitForStatus(firstSession.page, ['batch-queue.mp4'], 'failed')
    const queueStatus = await itemStatus(firstSession.page, 'batch-queue.mp4')
    if (queueStatus !== 'failed') throw new Error(`批量入队后的缺失媒体未进入失败态：${queueStatus}`)

    await selectItems(firstSession.page, ['batch-ignore-a.mp4', 'batch-ignore-b.mp4'])
    await firstSession.page.getByRole('button', { name: '批量忽略', exact: true }).click()
    await waitForStatus(firstSession.page, ['batch-ignore-a.mp4', 'batch-ignore-b.mp4'], 'ignored')
    const ignoredItems = await firstSession.page.evaluate(() => window.aiv.listMediaImportInbox())
    if (ignoredItems.filter((item) => item.fileName.startsWith('batch-ignore-') && item.status === 'ignored').length !== 2) throw new Error(`批量忽略未完整生效：${JSON.stringify(ignoredItems)}`)

    await selectItems(firstSession.page, ['batch-queue.mp4', 'batch-ignore-a.mp4', 'batch-ignore-b.mp4', 'batch-retry-failed.mp4', 'batch-retry-missing.mp4'])
    await firstSession.page.getByRole('button', { name: '批量重试', exact: true }).click()
    const retriedNames = ['batch-queue.mp4', 'batch-ignore-a.mp4', 'batch-ignore-b.mp4', 'batch-retry-failed.mp4', 'batch-retry-missing.mp4']
    await waitForStatus(firstSession.page, retriedNames, 'failed')

    const persistedItems = await waitForPersistedStatuses(join(userDataDirectory, 'media-import-inbox.json'), retriedNames, 'failed')
    if (persistedItems.some((item) => !item.lastError)) throw new Error(`批量重试错误信息未持久化：${JSON.stringify(persistedItems)}`)
    if (firstSession.errors.length > 0) throw new Error(`Renderer errors during inbox batch smoke:\n${firstSession.errors.join('\n')}`)
    console.log(`Import inbox batch actions persisted: ${JSON.stringify({ queued: true, ignored: 2, retried: retriedNames.length, failedAfterMissingMedia: true })}`)

    await firstApp.close()
    firstApp = null
    const secondSession = await launchPlayer(userDataDirectory)
    secondApp = secondSession.app
    await openInbox(secondSession.page)
    const restored = await secondSession.page.evaluate(() => window.aiv.listMediaImportInbox())
    const restoredItems = restored.filter((item) => retriedNames.includes(item.fileName))
    if (restoredItems.length !== retriedNames.length || restoredItems.some((item) => item.status !== 'failed' || !item.lastError)) throw new Error(`重启后批量收件箱状态未恢复：${JSON.stringify(restored)}`)
    if (secondSession.errors.length > 0) throw new Error(`Renderer errors after inbox batch restart:\n${secondSession.errors.join('\n')}`)
    console.log(`AIVPlayer Smoke Vision Import Inbox Batch passed: ${JSON.stringify({ batchQueue: true, batchIgnore: true, batchRetry: true, restartRestored: true })}`)
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
