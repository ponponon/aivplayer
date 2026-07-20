import { access, copyFile, mkdtemp, readdir, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { _electron as electron } from 'playwright'

const smokeHomeDirectory = await mkdtemp(join(tmpdir(), 'aivplayer-smoke-image-home-'))
const smokeUserDataDirectory = await mkdtemp(join(tmpdir(), 'aivplayer-smoke-image-user-data-'))
const smokeInputDirectory = await mkdtemp(join(tmpdir(), 'aivplayer-smoke-image-input-'))
const smokeOutputDirectory = await mkdtemp(join(tmpdir(), 'aivplayer-smoke-image-output-'))
const screenshotPath = join(tmpdir(), `aivplayer-smoke-image-editor-${Date.now()}.png`)
const inputImagePaths = [join(smokeInputDirectory, 'smoke-photo-a.png'), join(smokeInputDirectory, 'smoke-photo-b.png')]
const portraitSvg = '<svg xmlns="http://www.w3.org/2000/svg" width="400" height="800"><rect width="400" height="800" fill="#283746"/><circle cx="200" cy="220" r="120" fill="#e8c16d"/><text x="70" y="520" fill="white" font-family="Arial" font-size="46">PORTRAIT</text></svg>'
await copyFile(join(process.cwd(), 'docs/assets/icon.png'), inputImagePaths[0])
await copyFile(join(process.cwd(), 'docs/assets/icon.png'), inputImagePaths[1])

const app = await electron.launch({ args: [`--user-data-dir=${smokeUserDataDirectory}`, 'out/main/index.js'], env: { ...process.env, HOME: smokeHomeDirectory, AIVPLAYER_SMOKE_IMAGE_OUTPUT_DIRECTORY: smokeOutputDirectory } })
try {
  const page = await app.firstWindow()
  await page.waitForLoadState('domcontentloaded')
  await page.waitForSelector('#root', { timeout: 10_000 })
  await page.locator('.image-editor-tool-button').click()
  await page.waitForSelector('.image-workspace')
  await page.locator('input[type=file]').setInputFiles({ name: 'portrait-preview.svg', mimeType: 'image/svg+xml', buffer: Buffer.from(portraitSvg) })
  await page.waitForFunction(() => {
    const image = document.querySelector('.image-preview-media') as HTMLImageElement | null
    return image !== null && image.naturalWidth === 400 && image.naturalHeight === 800
  }, undefined, { timeout: 10_000 })
  const previewCanvasBox = await page.locator('.image-preview-canvas').boundingBox()
  const portraitBox = await page.locator('.image-preview-media').boundingBox()
  if (!previewCanvasBox || !portraitBox || Math.abs(portraitBox.width / portraitBox.height - 0.5) > 0.02 || portraitBox.width > previewCanvasBox.width || portraitBox.height > previewCanvasBox.height) {
    throw new Error(`Portrait image was not contained naturally: ${JSON.stringify({ previewCanvasBox, portraitBox })}`)
  }
  await page.locator('.image-inspector-heading .image-ghost-button.danger').click()
  await page.locator('.image-preview-empty').waitFor()
  await page.locator('input[type=file]').setInputFiles(inputImagePaths)
  await page.locator('.image-library-item').nth(1).waitFor()
  await page.locator('.image-preset-row button').nth(1).click()
  await page.locator('.image-check-row input').check()
  await page.locator('.image-target-input .image-number-input').fill('8')
  await page.waitForTimeout(900)
  const summary = await page.locator('.image-output-summary').innerText()
  if (!summary.includes('8')) throw new Error(`Target-size summary did not update: ${summary}`)
  const batchButton = page.locator('.image-workspace-actions .image-secondary-button').nth(1)
  const waitForBatchComplete = async (): Promise<void> => {
    await page.waitForFunction(() => (document.querySelector('.image-workspace-actions .image-secondary-button:nth-of-type(2)') as HTMLButtonElement | null)?.disabled ?? false, undefined, { timeout: 15_000 })
    await page.waitForFunction(() => {
      const button = document.querySelector('.image-workspace-actions .image-secondary-button:nth-of-type(2)') as HTMLButtonElement | null
      return button !== null && !button.disabled && (document.querySelector('.image-workspace-notice')?.textContent?.includes('已导出 2 张图片') ?? false)
    }, undefined, { timeout: 15_000 })
  }
  await batchButton.click()
  await waitForBatchComplete()
  const firstBatchNames = (await readdir(smokeOutputDirectory)).sort()
  if (firstBatchNames.length !== 2 || !firstBatchNames.every((name) => name.endsWith('-edited.png'))) throw new Error(`Unexpected first batch output: ${firstBatchNames.join(', ')}`)
  await batchButton.click()
  await waitForBatchComplete()
  const secondBatchNames = (await readdir(smokeOutputDirectory)).sort()
  if (secondBatchNames.length !== 4 || !secondBatchNames.every((name) => /-edited(?:-2)?\.png$/.test(name))) throw new Error(`Batch collision handling failed: ${secondBatchNames.join(', ')}`)
  const overwriteButton = page.locator('.image-danger-button')
  if (await overwriteButton.isDisabled()) throw new Error('Overwrite originals should be enabled for PNG inputs')
  const dialogPromise = page.waitForEvent('dialog').then(async (dialog) => {
    if (dialog.type() !== 'confirm') throw new Error(`Expected overwrite confirmation, received ${dialog.type()}`)
    await dialog.accept()
  })
  await Promise.all([overwriteButton.click(), dialogPromise])
  await waitForBatchComplete()
  await Promise.all(inputImagePaths.map((filePath) => access(filePath)))
  await page.locator('.image-back-button').click()
  await page.waitForSelector('.workspace')
  await page.locator('.image-editor-tool-button').click()
  await page.locator('.image-library-item').first().waitFor()
  if (!(await page.locator('.image-output-summary').innerText()).includes('8')) throw new Error('Image editor state was not retained after returning from video view')
  await page.screenshot({ path: screenshotPath, fullPage: false })
  console.log(`Image editor smoke passed. Screenshot: ${screenshotPath}`)
} finally {
  await app.close()
  await rm(smokeHomeDirectory, { recursive: true, force: true })
  await rm(smokeUserDataDirectory, { recursive: true, force: true })
  await rm(smokeInputDirectory, { recursive: true, force: true })
  await rm(smokeOutputDirectory, { recursive: true, force: true })
}
