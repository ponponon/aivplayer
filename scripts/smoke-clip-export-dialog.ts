import { mkdtemp, stat } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { _electron as electron } from 'playwright'

const mediaPath = process.argv[2] ?? '/Users/ponponon/Downloads/下载.mp4'

async function main(): Promise<void> {
  const smokeHomeDirectory = await mkdtemp(join(tmpdir(), 'aivplayer-smoke-editing-export-home-'))
  const smokeOutputDirectory = await mkdtemp(join(tmpdir(), 'aivplayer-smoke-editing-export-output-'))
  const outputVideoPath = join(smokeOutputDirectory, 'aivplayer-smoke-target.mp4')

  const app = await electron.launch({
    args: [`--user-data-dir=${smokeHomeDirectory}`, 'out/main/index.js', mediaPath],
    env: {
      ...process.env,
      HOME: smokeHomeDirectory
    }
  })

  try {
    const page = await app.firstWindow()
    page.on('console', (message) => {
      console.log(`[renderer:${message.type()}] ${message.text()}`)
    })
    page.on('pageerror', (error) => {
      console.log(`[renderer:error] ${error.message}`)
    })

    await page.waitForLoadState('domcontentloaded')
    await page.waitForSelector('#root', { timeout: 10_000 })
    await page.waitForSelector('video.video-surface', { timeout: 10_000 })
    await page.waitForTimeout(1_000)

    await page.locator('.clip-editor-tool-button').click()
    await page.locator('[data-testid="editing-timeline"]').waitFor({ timeout: 10_000 })
    await page.locator('[data-testid="editing-export"]').click()
    await page.locator('[data-testid="editing-export-target"]').waitFor({ timeout: 10_000 })

    const initialTarget = await page.evaluate(() => {
      const input = document.querySelector('[data-testid="editing-export-target"] input') as HTMLInputElement | null
      const directory = document.querySelector('.editing-export-target-directory-copy code')?.textContent ?? ''
      const preview = document.querySelector('.editing-export-target-preview')?.textContent ?? ''
      return { fileName: input?.value ?? '', directory, preview }
    })

    const fileNameInput = page.locator('[data-testid="editing-export-target"] input')
    await fileNameInput.fill('aivplayer-smoke-renamed.mp4')
    const renamedPreview = await page.locator('.editing-export-target-preview').textContent()
    const screenshotPath = join(smokeHomeDirectory, 'aivplayer-smoke-editing-export-dialog.png')
    await page.screenshot({ path: screenshotPath, fullPage: false })
    await page.locator('.editing-export-confirm-cancel').click()

    const exportResult = await page.evaluate(async ({ sourcePath, targetPath }) => window.aiv.exportMediaTimeline({
      mediaPath: sourcePath,
      clips: [{ mediaPath: sourcePath, startSeconds: 0, endSeconds: 1 }],
      mode: 'video',
      outputVideoPath: targetPath
    }), { sourcePath: mediaPath, targetPath: outputVideoPath })
    const outputStats = exportResult.success ? await stat(outputVideoPath).catch(() => null) : null
    const exportState = { success: exportResult.success, message: exportResult.message, outputBytes: outputStats?.size ?? 0 }

    console.log('AIVPlayer Smoke Editing Export Dialog')
    console.log(`Media: ${mediaPath}`)
    console.log(`Initial target: ${JSON.stringify(initialTarget)}`)
    console.log(`Renamed preview: ${renamedPreview ?? 'missing'}`)
    console.log(`Export result: ${JSON.stringify(exportState)}`)
    console.log(`Screenshot: ${screenshotPath}`)

    if (!initialTarget.fileName.endsWith('.mp4') || !initialTarget.directory || !initialTarget.preview.includes(initialTarget.fileName)) process.exitCode = 1
    if (!renamedPreview?.endsWith('aivplayer-smoke-renamed.mp4')) process.exitCode = 1
    if (!exportResult.success || !outputStats || outputStats.size <= 0) process.exitCode = 1
  } finally {
    await app.close()
  }
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
