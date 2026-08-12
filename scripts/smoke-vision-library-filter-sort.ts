import { createHash } from 'node:crypto'
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { basename, join, normalize, resolve } from 'node:path'
import { connect } from '@lancedb/lancedb'
import { _electron as electron, type ElectronApplication, type Page } from 'playwright'

const mediaPath = process.argv[2] ?? '/Users/ponponon/Music/aivplayer_test_video_1min.mp4'

type FixtureSource = {
  sourceId: string
  videoPath: string
  fileName: string
  frameCount: number
  indexedAtMs: number
  fileSizeBytes: number
  fileMtimeMs: number
}

const fixtureSources: FixtureSource[] = [
  { sourceId: 'source-travel', videoPath: '', fileName: 'episode-10.mp4', frameCount: 4, indexedAtMs: 3_000, fileSizeBytes: 100, fileMtimeMs: 1_000 },
  { sourceId: 'source-room', videoPath: '', fileName: 'episode-2.mp4', frameCount: 9, indexedAtMs: 2_000, fileSizeBytes: 200, fileMtimeMs: 2_000 },
  { sourceId: 'source-trailer', videoPath: '', fileName: 'trailer.mp4', frameCount: 2, indexedAtMs: 1_000, fileSizeBytes: 300, fileMtimeMs: 3_000 }
]

function itemId(filePath: string): string {
  const normalizedPath = normalize(resolve(filePath))
  return createHash('sha256').update(process.platform === 'win32' ? normalizedPath.toLowerCase() : normalizedPath).digest('hex').slice(0, 32)
}

function sidecarPath(filePath: string): string {
  return join(resolve(filePath, '..'), `.${basename(filePath)}.aivplayer.json`)
}

async function seedLibrary(userDataDirectory: string): Promise<{ sourceDirectory: string; sources: FixtureSource[] }> {
  const sourceDirectory = await mkdtemp(join('/tmp', 'aivplayer-smoke-library-filter-sort-'))
  const sources = fixtureSources.map((source) => ({ ...source, videoPath: join(sourceDirectory, source.fileName) }))
  const databaseDirectory = join(userDataDirectory, 'library', 'vision', 'lancedb')
  await mkdir(databaseDirectory, { recursive: true })
  const database = await connect(databaseDirectory)
  await database.createTable('video_sources', sources.map((source) => ({
    id: source.sourceId,
    video_path: source.videoPath,
    file_name: source.fileName,
    file_size_bytes: source.fileSizeBytes,
    file_mtime_ms: source.fileMtimeMs,
    sample_interval_seconds: 3,
    subtitle_path: '',
    subtitle_size_bytes: 0,
    subtitle_mtime_ms: 0,
    frame_count: source.frameCount,
    model_id: 'smoke-model',
    model_variant: 'smoke-variant',
    indexed_at_ms: source.indexedAtMs
  })))

  const now = Date.now()
  const items = sources.map((source, index) => ({
    path: source.videoPath,
    fileName: source.fileName,
    directoryPath: sourceDirectory,
    sizeBytes: source.fileSizeBytes,
    mtimeMs: source.fileMtimeMs,
    id: itemId(source.videoPath),
    status: 'ready',
    discoveredAt: now,
    updatedAt: now + index,
    metadata: { tags: [], favorite: false, note: '', source: null, projectId: null },
    pipeline: { metadata: 'ready', subtitle: 'ready', vision: 'ready' }
  }))
  await writeFile(join(userDataDirectory, 'media-import-inbox.json'), `${JSON.stringify({ schemaVersion: 1, items }, null, 2)}\n`, { encoding: 'utf8', mode: 0o600 })
  await writeFile(sidecarPath(sources[0].videoPath), `${JSON.stringify({
    schemaVersion: 1,
    mediaId: itemId(sources[0].videoPath),
    fileName: sources[0].fileName,
    updatedAt: now,
    metadata: { tags: ['旅行'], favorite: true, note: '重点素材', source: '外拍', projectId: 'travel-01' }
  }, null, 2)}\n`, { encoding: 'utf8', mode: 0o600 })
  return { sourceDirectory, sources }
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

async function openLibrary(page: Page): Promise<void> {
  await page.getByRole('tab', { name: '影视库搜索' }).click()
  const library = page.locator('.vision-library-sources')
  await library.waitFor({ timeout: 10_000 })
  await page.waitForFunction(() => document.querySelectorAll('.vision-library-source').length === 3, undefined, { timeout: 15_000 })
}

async function sourceNames(page: Page): Promise<string[]> {
  return page.locator('.vision-library-source strong').allTextContents()
}

async function runSmoke(): Promise<void> {
  const userDataDirectory = await mkdtemp(join('/tmp', 'aivplayer-smoke-vision-library-filter-sort-user-data-'))
  let sourceDirectory = ''
  let firstApp: ElectronApplication | null = null
  let secondApp: ElectronApplication | null = null

  try {
    const seeded = await seedLibrary(userDataDirectory)
    sourceDirectory = seeded.sourceDirectory
    const firstSession = await launchPlayer(userDataDirectory)
    firstApp = firstSession.app
    await openLibrary(firstSession.page)
    const library = firstSession.page.locator('.vision-library-sources')

    const recentNames = await sourceNames(firstSession.page)
    if (recentNames.join('|') !== 'episode-10.mp4|episode-2.mp4|trailer.mp4') throw new Error(`最近索引排序错误：${JSON.stringify(recentNames)}`)
    const travelCard = library.locator('.vision-library-source').filter({ hasText: 'episode-10.mp4' })
    if (!(await travelCard.textContent())?.includes('外拍') || !(await travelCard.textContent())?.includes('#旅行') || !(await travelCard.textContent())?.includes('重点素材')) throw new Error('素材库未投影 sidecar 标签、来源和备注')

    const search = library.getByRole('textbox', { name: '搜索文件名、路径、标签、来源或备注' })
    await search.fill('旅行')
    await firstSession.page.waitForFunction(() => document.querySelectorAll('.vision-library-source').length === 1, undefined, { timeout: 5_000 })
    if ((await sourceNames(firstSession.page))[0] !== 'episode-10.mp4') throw new Error(`标签搜索命中错误：${JSON.stringify(await sourceNames(firstSession.page))}`)
    await search.fill('')

    await library.getByRole('checkbox', { name: '仅看收藏' }).check()
    await firstSession.page.waitForFunction(() => document.querySelectorAll('.vision-library-source').length === 1, undefined, { timeout: 5_000 })
    if ((await sourceNames(firstSession.page))[0] !== 'episode-10.mp4') throw new Error(`收藏筛选命中错误：${JSON.stringify(await sourceNames(firstSession.page))}`)
    await library.getByRole('checkbox', { name: '仅看收藏' }).uncheck()

    const sort = library.getByRole('combobox', { name: '排序' })
    await sort.selectOption('name')
    if ((await sourceNames(firstSession.page)).join('|') !== 'episode-2.mp4|episode-10.mp4|trailer.mp4') throw new Error(`文件名排序错误：${JSON.stringify(await sourceNames(firstSession.page))}`)
    await sort.selectOption('frames')
    if ((await sourceNames(firstSession.page)).join('|') !== 'episode-2.mp4|episode-10.mp4|trailer.mp4') throw new Error(`帧数排序错误：${JSON.stringify(await sourceNames(firstSession.page))}`)

    const sidecar = sidecarPath(seeded.sources[0].videoPath)
    const changedSidecar = JSON.parse(await readFile(sidecar, 'utf8')) as { metadata: Record<string, unknown>; updatedAt: number }
    changedSidecar.updatedAt += 1_000
    changedSidecar.metadata = { tags: ['重启标签'], favorite: false, note: '重启后更新', source: '后期', projectId: 'restart-02' }
    await writeFile(sidecar, `${JSON.stringify(changedSidecar, null, 2)}\n`, { encoding: 'utf8', mode: 0o600 })

    await firstApp.close()
    firstApp = null
    const secondSession = await launchPlayer(userDataDirectory)
    secondApp = secondSession.app
    await openLibrary(secondSession.page)
    const restoredLibrary = secondSession.page.locator('.vision-library-sources')
    const restoredTravelCard = restoredLibrary.locator('.vision-library-source').filter({ hasText: 'episode-10.mp4' })
    const restoredText = await restoredTravelCard.textContent()
    if (!restoredText?.includes('后期') || !restoredText.includes('#重启标签') || !restoredText.includes('重启后更新')) throw new Error(`重启后 sidecar 投影未更新：${restoredText}`)
    await restoredLibrary.getByRole('checkbox', { name: '仅看收藏' }).check()
    await secondSession.page.waitForFunction(() => document.querySelectorAll('.vision-library-source').length === 0, undefined, { timeout: 5_000 })
    await restoredLibrary.getByRole('checkbox', { name: '仅看收藏' }).uncheck()
    await restoredLibrary.getByRole('textbox', { name: '搜索文件名、路径、标签、来源或备注' }).fill('重启标签')
    await secondSession.page.waitForFunction(() => document.querySelectorAll('.vision-library-source').length === 1, undefined, { timeout: 5_000 })

    const rendererErrors = [...firstSession.errors, ...secondSession.errors]
    if (rendererErrors.length > 0) throw new Error(`Renderer errors during vision library filter smoke:\n${rendererErrors.join('\n')}`)
    console.log(`AIVPlayer Smoke Vision Library Filter Sort passed: ${JSON.stringify({ searchedMetadata: true, favoriteFilter: true, sortModes: ['recent', 'name', 'frames'], restartSidecarProjection: true })}`)
  } finally {
    if (secondApp) await secondApp.close().catch(() => undefined)
    if (firstApp) await firstApp.close().catch(() => undefined)
    if (sourceDirectory) await rm(sourceDirectory, { recursive: true, force: true }).catch(() => undefined)
    await rm(userDataDirectory, { recursive: true, force: true }).catch(() => undefined)
  }
}

runSmoke().catch((error) => {
  console.error(error instanceof Error ? error.stack ?? error.message : String(error))
  process.exitCode = 1
})
