import { mkdir, mkdtemp, rm } from 'node:fs/promises'
import { basename, join } from 'node:path'
import { tmpdir } from 'node:os'
import { connect } from '@lancedb/lancedb'
import { _electron as electron, type ElectronApplication, type Page } from 'playwright'

const mediaPath = process.argv[2] ?? '/Users/ponponon/Music/aivplayer_test_video_1min.mp4'
const fixtureCount = 30

function evidenceRow(index: number): Record<string, unknown> {
  return {
    id: `cursor-evidence-${index}`,
    source_id: 'cursor-source',
    video_path: mediaPath,
    file_name: basename(mediaPath),
    evidence_type: 'ocr',
    start_seconds: index,
    end_seconds: index + 0.8,
    text: `视觉游标 Smoke 关键字 ${index}`,
    frame_id: `cursor-frame-${index}`,
    thumbnail_path: '',
    confidence: 0.9,
    box_xmin: 0,
    box_ymin: 0,
    box_xmax: 0,
    box_ymax: 0,
    source_fingerprint: `${mediaPath}:cursor-smoke`,
    model_id: 'smoke-model',
    model_variant: 'smoke-variant',
    generated_at: 1_000 + index
  }
}

async function seedEvidence(userDataDirectory: string): Promise<void> {
  const databaseDirectory = join(userDataDirectory, 'library', 'vision', 'lancedb')
  await mkdir(databaseDirectory, { recursive: true })
  const database = await connect(databaseDirectory)
  await database.createTable('video_evidence', Array.from({ length: fixtureCount }, (_, index) => evidenceRow(index)))
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

async function runSmoke(): Promise<void> {
  const userDataDirectory = await mkdtemp(join(tmpdir(), 'aivplayer-smoke-vision-search-cursor-user-data-'))
  let app: ElectronApplication | null = null

  try {
    await seedEvidence(userDataDirectory)
    const session = await launchPlayer(userDataDirectory)
    app = session.app
    const page = session.page
    await page.getByRole('tab', { name: '影视库搜索' }).click()
    await page.locator('.vision-panel').waitFor({ timeout: 10_000 })

    const firstPage = await page.evaluate(() => window.aiv.searchVisionPage({ kind: 'text', request: { query: '视觉游标 Smoke 关键字', mode: 'hybrid', limit: 24 } }))
    if (firstPage.results.length !== 24 || firstPage.total !== fixtureCount || !firstPage.cursor || !firstPage.hasMore) {
      throw new Error(`Vision cursor first page mismatch: ${JSON.stringify({ count: firstPage.results.length, total: firstPage.total, cursor: firstPage.cursor, hasMore: firstPage.hasMore })}`)
    }

    const database = await connect(join(userDataDirectory, 'library', 'vision', 'lancedb'))
    const table = await database.openTable('video_evidence')
    await table.add([evidenceRow(99)])
    const secondPage = await page.evaluate((cursor) => window.aiv.searchVisionPage({ kind: 'text', cursor, offset: 24, request: { query: '视觉游标 Smoke 关键字', mode: 'hybrid', limit: 24 } }), firstPage.cursor)
    if (secondPage.total !== fixtureCount || secondPage.results.length !== 6 || secondPage.results.some((result) => result.id === 'cursor-evidence-99') || secondPage.cursor !== undefined) {
      throw new Error(`Vision cursor snapshot was not stable: ${JSON.stringify({ total: secondPage.total, count: secondPage.results.length, hasNewEvidence: secondPage.results.some((result) => result.id === 'cursor-evidence-99'), cursor: secondPage.cursor })}`)
    }

    const crossKindMessage = await page.evaluate(async (cursor) => {
      try {
        await window.aiv.searchVisionPage({ kind: 'image', cursor, offset: 24, request: { imagePath: '/tmp/cursor-smoke.png', limit: 24 } })
        return null
      } catch (error) {
        return error instanceof Error ? error.message : String(error)
      }
    }, firstPage.cursor)
    if (!crossKindMessage?.includes('游标已过期或无效')) throw new Error(`Vision cursor cross-kind rejection mismatch: ${JSON.stringify({ crossKindMessage })}`)

    if (session.errors.length > 0) throw new Error(`Renderer errors during vision cursor smoke:\n${session.errors.join('\n')}`)
    console.log(`AIVPlayer Smoke Vision Search Cursor passed: ${JSON.stringify({ firstPageCount: firstPage.results.length, snapshotTotal: secondPage.total, secondPageCount: secondPage.results.length, crossKindRejected: true })}`)
  } finally {
    if (app) await app.close().catch(() => undefined)
    await rm(userDataDirectory, { recursive: true, force: true }).catch(() => undefined)
  }
}

runSmoke().catch((error) => {
  console.error(error instanceof Error ? error.stack ?? error.message : String(error))
  process.exitCode = 1
})
