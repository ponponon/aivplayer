import { mkdtemp, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { _electron as electron, type ElectronApplication, type Page } from 'playwright'

const mediaPath = process.argv[2] ?? '/Users/ponponon/Music/aivplayer_test_video_1min.mp4'
const screenshotPath = process.env.AIVPLAYER_SMOKE_SCREENSHOT_PATH

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
  await page.locator('#root').waitFor({ timeout: 10_000 })
  return { app, page, errors }
}

async function openVisionPanel(page: Page): Promise<string> {
  await page.getByRole('tab', { name: '影视库搜索' }).click()
  await page.locator('.vision-panel').waitFor({ timeout: 10_000 })
  const identity = (await page.locator('.vision-intro h2').textContent())?.trim() ?? ''
  if (!identity) throw new Error('Vision panel identity is missing')
  return identity
}

async function runSmoke(): Promise<void> {
  const userDataDirectory = await mkdtemp(join(tmpdir(), 'aivplayer-smoke-vision-clip-collection-history-detail-'))
  const title = `集合历史详情 Smoke ${Date.now()}`
  let app: ElectronApplication | null = null

  try {
    const session = await launchPlayer(userDataDirectory)
    app = session.app
    const page = session.page
    const pageIdentity = await openVisionPanel(page)
    const original = await page.evaluate((collectionTitle) => window.aiv.saveVisionClipCollection({
      title: collectionTitle,
      tags: ['详情验证', 'Smoke'],
      isArchived: true,
      sortMode: 'duration-desc',
      selections: [
        {
          sourceId: 'source-operation-history-detail-smoke',
          videoPath: '/tmp/aivplayer-operation-history-detail-smoke-missing.mp4',
          fileName: 'operation-history-detail-smoke-missing.mp4',
          fingerprint: 'operation-history-detail-smoke-fingerprint',
          durationSeconds: 30,
          startSeconds: 1,
          endSeconds: 2,
          evidenceIds: ['operation-history-detail-evidence-1'],
          text: '不应显示的详情文本一',
          evidenceTypes: ['subtitle']
        },
        {
          sourceId: 'source-operation-history-detail-smoke',
          videoPath: '/tmp/aivplayer-operation-history-detail-smoke-missing.mp4',
          fileName: 'operation-history-detail-smoke-missing.mp4',
          fingerprint: 'operation-history-detail-smoke-fingerprint',
          durationSeconds: 30,
          startSeconds: 5,
          endSeconds: 7,
          evidenceIds: ['operation-history-detail-evidence-2'],
          text: '不应显示的详情文本二',
          evidenceTypes: ['scene']
        }
      ]
    }), title)

    await page.reload({ waitUntil: 'domcontentloaded' })
    await openVisionPanel(page)
    const row = page.locator('.vision-collection').filter({ hasText: title }).first()
    await row.waitFor({ timeout: 10_000 })
    await row.getByRole('button', { name: `收藏集合: ${title}`, exact: true }).click()
    await page.getByRole('status').filter({ hasText: `已将“${title}”标记为收藏` }).waitFor({ timeout: 10_000 })

    const entry = page.locator('.vision-collection-operation-history-entry').first()
    await entry.waitFor({ timeout: 10_000 })
    await entry.getByRole('button', { name: '查看详情', exact: true }).click()
    const detailRegion = page.locator('.vision-collection-operation-history-detail')
    await detailRegion.waitFor({ timeout: 10_000 })
    const detailText = (await detailRegion.textContent())?.trim() ?? ''
    const detail = await page.evaluate((operationId) => window.aiv.getVisionClipCollectionOperationHistoryDetail(operationId), (await page.evaluate(() => window.aiv.listVisionClipCollectionOperationHistory()))[0]?.id ?? '')
    if (!detail || detail.type !== 'flags' || detail.beforeCollections[0]?.id !== original.id || detail.afterCollections[0]?.title !== title || detail.beforeCollections[0]?.selectionCount !== 2 || detail.afterCollections[0]?.selectionCount !== 2) {
      throw new Error(`Collection operation history detail data mismatch: ${JSON.stringify(detail)}`)
    }
    const serializedDetail = JSON.stringify(detail)
    if (serializedDetail.includes('/tmp/aivplayer-operation-history-detail-smoke-missing.mp4') || serializedDetail.includes('不应显示的详情文本')) {
      throw new Error(`Collection operation history detail leaked media data: ${serializedDetail}`)
    }
    if (!detailText.includes(title) || !detailText.includes('详情验证') || !detailText.includes(original.id) || !detailText.includes('2 个选段') || !detailText.includes('操作前') || !detailText.includes('操作后')) {
      throw new Error(`Collection operation history detail UI mismatch: ${detailText}`)
    }
    if (screenshotPath) {
      await detailRegion.scrollIntoViewIfNeeded()
      await page.screenshot({ path: screenshotPath, fullPage: false })
    }

    await detailRegion.getByRole('button', { name: '收起详情', exact: true }).click()
    if (await page.locator('.vision-collection-operation-history-detail').count() !== 0) throw new Error('Collection operation history detail remained open after close')
    if (session.errors.length > 0) throw new Error(`Renderer errors during collection operation history detail smoke:\n${session.errors.join('\n')}`)
    console.log(`AIVPlayer Smoke Vision Clip Collection Operation History Detail passed: ${JSON.stringify({ pageIdentity, detailVisible: true, safeFieldsVerified: true, detailClosed: true, consoleErrors: session.errors.length, screenshotPath: screenshotPath ?? null })}`)
  } finally {
    if (app) await app.close().catch(() => undefined)
    await rm(userDataDirectory, { recursive: true, force: true }).catch(() => undefined)
  }
}

runSmoke().catch((error) => {
  console.error(error instanceof Error ? error.stack ?? error.message : String(error))
  process.exitCode = 1
})
