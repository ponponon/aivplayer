import { mkdtemp, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { _electron as electron, type ElectronApplication, type Page } from 'playwright'

const mediaPath = process.argv[2] ?? '/Users/ponponon/Music/aivplayer_test_video_1min.mp4'

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

async function openVisionPanel(page: Page): Promise<void> {
  await page.getByRole('tab', { name: '影视库搜索' }).click()
  await page.locator('.vision-panel').waitFor({ timeout: 10_000 })
}

async function confirmCollectionDeletion(page: Page, accept: boolean): Promise<string> {
  const dialogPromise = page.waitForEvent('dialog').then(async (dialog) => {
    if (dialog.type() !== 'confirm') throw new Error(`Expected collection deletion confirmation, received ${dialog.type()}`)
    const message = dialog.message()
    if (accept) await dialog.accept()
    else await dialog.dismiss()
    return message
  })
  await Promise.all([page.getByRole('button', { name: '删除选中集合', exact: true }).click(), dialogPromise])
  return await dialogPromise
}

async function runSmoke(): Promise<void> {
  const userDataDirectory = await mkdtemp(join(tmpdir(), 'aivplayer-smoke-vision-clip-collection-batch-delete-'))
  const prefix = `批量删除 Smoke ${Date.now()}`
  const titles = [`${prefix} 一号`, `${prefix} 二号`, `${prefix} 三号`]
  let app: ElectronApplication | null = null

  try {
    const session = await launchPlayer(userDataDirectory)
    app = session.app
    const page = session.page
    await openVisionPanel(page)

    const originals = await page.evaluate(({ titles: nextTitles }) => Promise.all(nextTitles.map((title, index) => window.aiv.saveVisionClipCollection({
      title,
      tags: ['smoke', 'delete'],
      sortMode: 'source-time',
      selections: [{
        sourceId: 'source-batch-delete-smoke',
        videoPath: '/tmp/aivplayer-batch-delete-smoke-missing.mp4',
        fileName: 'batch-delete-smoke-missing.mp4',
        fingerprint: 'batch-delete-smoke-fingerprint',
        durationSeconds: 30,
        startSeconds: index + 1,
        endSeconds: index + 5,
        evidenceIds: [`batch-delete-evidence-${index + 1}`],
        text: `批量删除验证 ${index + 1}`,
        evidenceTypes: ['subtitle']
      }]
    }))), { titles })
    await page.reload({ waitUntil: 'domcontentloaded' })
    await openVisionPanel(page)

    for (const title of titles.slice(0, 2)) {
      const row = page.locator('.vision-collection').filter({ hasText: title }).first()
      await row.waitFor({ timeout: 10_000 })
      await row.getByRole('checkbox', { name: `选择集合：${title}`, exact: true }).check()
    }

    const cancelledMessage = await confirmCollectionDeletion(page, false)
    if (!cancelledMessage.includes('2') || (await page.evaluate(() => window.aiv.listVisionClipCollections())).length !== 3) {
      throw new Error(`Collection deletion confirmation cancel mismatch: ${cancelledMessage}`)
    }

    const acceptedMessage = await confirmCollectionDeletion(page, true)
    if (!acceptedMessage.includes('2')) throw new Error(`Collection deletion confirmation count mismatch: ${acceptedMessage}`)
    await page.getByRole('status').filter({ hasText: '已删除 2 个集合' }).waitFor({ timeout: 10_000 })

    const afterDelete = await page.evaluate(() => window.aiv.listVisionClipCollections())
    if (afterDelete.length !== 1 || afterDelete[0]?.id !== originals[2]?.id || afterDelete[0]?.title !== titles[2]) {
      throw new Error(`Clip collection batch delete persistence mismatch: ${JSON.stringify(afterDelete)}`)
    }
    await page.reload({ waitUntil: 'domcontentloaded' })
    await openVisionPanel(page)
    await page.getByText(titles[2], { exact: true }).waitFor({ timeout: 10_000 })
    for (const title of titles.slice(0, 2)) {
      if (await page.getByText(title, { exact: true }).count() !== 0) throw new Error(`Deleted collection remained visible: ${title}`)
    }

    if (session.errors.length > 0) throw new Error(`Renderer errors during clip collection batch delete smoke:\n${session.errors.join('\n')}`)
    console.log(`AIVPlayer Smoke Vision Clip Collection Batch Delete passed: ${JSON.stringify({ originalCount: originals.length, deletedCount: 2, remainingCount: afterDelete.length, confirmationCancel: true })}`)
  } finally {
    if (app) await app.close().catch(() => undefined)
    await rm(userDataDirectory, { recursive: true, force: true }).catch(() => undefined)
  }
}

runSmoke().catch((error) => {
  console.error(error instanceof Error ? error.stack ?? error.message : String(error))
  process.exitCode = 1
})
