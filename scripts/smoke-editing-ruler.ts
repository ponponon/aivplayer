import { _electron as electron } from 'playwright'
import { mkdtemp } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'

const sourceMediaPath = process.argv[2] ?? '/Users/ponponon/Music/aivplayer_test_video_1min_360p.mp4'

type RulerSnapshot = {
  labels: string[]
  tickCount: number
  rulerWidth: number
  overlap: boolean
  firstLeft: number
  lastRight: number
}

async function main(): Promise<void> {
  const smokeHomeDirectory = await mkdtemp(join(tmpdir(), 'aivplayer-smoke-editing-ruler-home-'))
  const app = await electron.launch({
    args: ['--no-sandbox', '--in-process-gpu', `--user-data-dir=${smokeHomeDirectory}`, 'out/main/index.js', sourceMediaPath],
    env: { ...process.env, HOME: smokeHomeDirectory }
  })

  try {
    const page = await app.firstWindow()
    const consoleErrors: string[] = []
    page.on('console', (message) => { if (message.type() === 'error') consoleErrors.push(message.text()) })
    page.on('pageerror', (error) => consoleErrors.push(error.message))
    await page.waitForLoadState('domcontentloaded')
    await page.waitForSelector('video.video-surface', { timeout: 10_000 })
    await page.locator('.clip-editor-tool-button').click()
    await page.locator('[data-testid="editing-timeline"]').waitFor({ timeout: 10_000 })
    await page.waitForFunction(() => document.querySelectorAll('.editing-ruler-tick').length < 20, null, { timeout: 10_000 })

    const readRuler = async (): Promise<RulerSnapshot> => page.evaluate(() => {
      const ruler = document.querySelector('.editing-ruler')
      const rulerRect = ruler?.getBoundingClientRect()
      const boxes = Array.from(document.querySelectorAll('.editing-ruler-tick')).map((element) => {
        const rect = element.getBoundingClientRect()
        return { label: element.textContent ?? '', left: rect.left, right: rect.right }
      })
      const overlap = boxes.some((box, index) => index > 0 && box.left < boxes[index - 1].right - 0.5)
      return {
        labels: boxes.map((box) => box.label),
        tickCount: boxes.length,
        rulerWidth: ruler?.getBoundingClientRect().width ?? 0,
        overlap,
        firstLeft: (boxes[0]?.left ?? rulerRect?.left ?? 0) - (rulerRect?.left ?? 0),
        lastRight: (boxes.at(-1)?.right ?? rulerRect?.left ?? 0) - (rulerRect?.left ?? 0),
      }
    })

    const normal = await readRuler()
    const normalScreenshotPath = join(smokeHomeDirectory, 'aivplayer-smoke-editing-ruler.png')
    await page.screenshot({ path: normalScreenshotPath, fullPage: true })

    const zoomIn = page.getByRole('button', { name: /放大时间线|Zoom timeline in|タイムラインを拡大|타임라인 확대/u })
    for (let index = 0; index < 8; index += 1) await zoomIn.click()
    await page.waitForFunction(() => document.querySelector('.editing-zoom-label')?.textContent === '300%', null, { timeout: 10_000 })
    const zoomed = await readRuler()

    console.log('AIVPlayer Smoke Editing Ruler')
    console.log(`Media: ${sourceMediaPath}`)
    console.log(`Normal ruler: ${JSON.stringify(normal)}`)
    console.log(`Zoomed ruler: ${JSON.stringify(zoomed)}`)
    console.log(`Screenshot: ${normalScreenshotPath}`)
    console.log(`Renderer errors: ${JSON.stringify(consoleErrors)}`)

    if (normal.tickCount >= 20 || normal.overlap || normal.firstLeft < -0.5 || normal.lastRight > normal.rulerWidth + 0.5) process.exitCode = 1
    if (zoomed.rulerWidth <= normal.rulerWidth || zoomed.overlap || zoomed.firstLeft < -0.5 || zoomed.lastRight > zoomed.rulerWidth + 0.5) process.exitCode = 1
    if (consoleErrors.length > 0) process.exitCode = 1
  } finally {
    await app.close()
  }
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
