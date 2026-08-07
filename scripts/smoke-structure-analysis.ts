import { execFile } from 'node:child_process'
import { mkdtemp } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { promisify } from 'node:util'
import { _electron as electron } from 'playwright'

const execFileAsync = promisify(execFile)

async function createBlackStructureVideo(outputPath: string): Promise<void> {
  await execFileAsync('ffmpeg', [
    '-hide_banner', '-loglevel', 'error', '-y',
    '-f', 'lavfi', '-i', 'color=c=black:s=320x180:r=30:d=1',
    '-f', 'lavfi', '-i', 'color=c=red:s=320x180:r=30:d=2',
    '-f', 'lavfi', '-i', 'color=c=black:s=320x180:r=30:d=1',
    '-filter_complex', '[0:v][1:v][2:v]concat=n=3:v=1:a=0,format=yuv420p[v]',
    '-map', '[v]', '-c:v', 'libx264', '-preset', 'ultrafast', '-pix_fmt', 'yuv420p', outputPath
  ], { maxBuffer: 4 * 1024 * 1024 })
}

async function main(): Promise<void> {
  const smokeDirectory = await mkdtemp(join(tmpdir(), 'aivplayer-smoke-structure-analysis-'))
  const userDataDirectory = await mkdtemp(join(tmpdir(), 'aivplayer-smoke-structure-analysis-user-data-'))
  const homeDirectory = await mkdtemp(join(tmpdir(), 'aivplayer-smoke-structure-analysis-home-'))
  const mediaPath = join(smokeDirectory, 'black-structure.mp4')
  await createBlackStructureVideo(mediaPath)

  const app = await electron.launch({
    args: ['--no-sandbox', '--in-process-gpu', `--user-data-dir=${userDataDirectory}`, 'out/main/index.js', mediaPath],
    env: { ...process.env, HOME: homeDirectory }
  })
  const errors: string[] = []
  try {
    const page = await app.firstWindow()
    page.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()) })
    page.on('pageerror', (error) => errors.push(error.message))
    await page.waitForLoadState('domcontentloaded')
    await page.locator('video.video-surface').waitFor({ timeout: 15_000 })
    await page.waitForFunction(() => {
      const video = document.querySelector('video.video-surface') as HTMLVideoElement | null
      return Boolean(video && Number.isFinite(video.duration) && video.duration >= 3.5)
    }, undefined, { timeout: 15_000 })

    // PlaybackControls analyzes with the default threshold in the background;
    // use a smoke-only parameter so this explicit pair still proves a cold run.
    const first = await page.evaluate(async (path) => window.aiv.analyzeMediaStructure({ mediaPath: path, durationSeconds: 4, pixelThreshold: 0.11 }), mediaPath)
    if (!first.success || first.cacheHit || !first.cacheKey || !first.segments.some((segment) => segment.kind === 'intro') || !first.segments.some((segment) => segment.kind === 'outro')) {
      throw new Error(`Structure first analysis mismatch: ${JSON.stringify(first)}`)
    }
    const second = await page.evaluate(async (path) => window.aiv.analyzeMediaStructure({ mediaPath: path, durationSeconds: 4, pixelThreshold: 0.11 }), mediaPath)
    if (!second.success || !second.cacheHit || second.cacheKey !== first.cacheKey || second.segments.length !== first.segments.length) {
      throw new Error(`Structure cache reuse mismatch: ${JSON.stringify({ first, second })}`)
    }
    console.log(`Structure analysis cache reused: ${JSON.stringify({ firstSegments: first.segments, cacheKey: second.cacheKey })}`)

    await page.locator('video.video-surface').evaluate((element) => {
      const video = element as HTMLVideoElement
      video.currentTime = 0.5
      video.dispatchEvent(new Event('timeupdate'))
    })
    await page.locator('[data-testid="playback-structure-skip"]').waitFor({ state: 'visible', timeout: 15_000 })
    await page.locator('[data-testid="playback-structure-skip"]').click()
    await page.waitForFunction(() => {
      const video = document.querySelector('video.video-surface') as HTMLVideoElement | null
      return Boolean(video && video.currentTime > 1)
    }, undefined, { timeout: 5_000 })

    await page.locator('.clip-editor-tool-button').click()
    await page.locator('[data-testid="editing-timeline"]').waitFor({ timeout: 10_000 })
    const structure = page.locator('[data-testid="editing-structure-analysis"]')
    await structure.locator('summary').click()
    await structure.locator('.editing-structure-analyze').click()
    await structure.locator('.editing-structure-item').first().waitFor({ timeout: 15_000 })
    if (await structure.locator('summary small').count() !== 1) throw new Error('Structure UI did not expose cached analysis state')
    await structure.locator('.editing-structure-item-main').first().click()

    const initialMediaFile = await page.evaluate(async () => (await window.aiv.getInitialMediaFiles())[0] ?? null)
    const sourceKey = initialMediaFile?.fingerprint || initialMediaFile?.path
    const firstItem = structure.locator('.editing-structure-item').first()
    const segmentId = await firstItem.getAttribute('data-segment-id')
    if (!sourceKey || !segmentId) throw new Error('Structure correction smoke could not resolve media key or segment id')
    await firstItem.locator('.editing-structure-item-action').click()
    await page.waitForFunction(async ({ key, id }) => {
      const settings = await window.aiv.getAppSettings()
      return Boolean(settings.playback.structureCorrectionsByFingerprint[key]?.some((correction) => correction.segmentId === id))
    }, { key: sourceKey, id: segmentId }, { timeout: 5_000 })
    if (!(await firstItem.evaluate((element) => element.classList.contains('is-ignored')))) throw new Error('Structure result did not show ignored state')
    await firstItem.locator('.editing-structure-item-action').click()
    await page.waitForFunction(async ({ key, id }) => {
      const settings = await window.aiv.getAppSettings()
      return !(settings.playback.structureCorrectionsByFingerprint[key] ?? []).some((correction) => correction.segmentId === id)
    }, { key: sourceKey, id: segmentId }, { timeout: 5_000 })
    if (await firstItem.evaluate((element) => element.classList.contains('is-ignored'))) throw new Error('Structure result did not restore state')
    if (errors.length > 0) throw new Error(`Renderer errors during structure analysis smoke:\n${errors.join('\n')}`)
    console.log(`AIVPlayer Smoke Structure Analysis passed for ${mediaPath}`)
  } finally {
    await app.close().catch(() => undefined)
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack ?? error.message : String(error))
  process.exitCode = 1
})
