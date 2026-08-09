import { _electron as electron, type ElectronApplication, type Page } from 'playwright'
import { execFile } from 'node:child_process'
import { access, mkdir, mkdtemp, rm, symlink } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { tmpdir } from 'node:os'
import { promisify } from 'node:util'

const modelRoot = process.env.AIVPLAYER_SPEAKER_MODEL_ROOT
const sourceMediaPath = process.env.AIVPLAYER_SPEAKER_MEDIA_PATH ?? '/Users/ponponon/Music/aivplayer_test_video_1min.mp4'
const sourceAudioPath = process.env.AIVPLAYER_SPEAKER_AUDIO_PATH
const execFileAsync = promisify(execFile)
const SMOKE_MEDIA_DURATION_SECONDS = 20

if (!modelRoot) {
  throw new Error('请设置 AIVPLAYER_SPEAKER_MODEL_ROOT 后再运行说话人面板 Smoke。')
}
const configuredModelRoot = modelRoot

async function createSmokeMedia(outputPath: string): Promise<void> {
  if (sourceAudioPath) {
    await access(sourceAudioPath)
    await execFileAsync('ffmpeg', [
      '-hide_banner', '-loglevel', 'error', '-y',
      '-f', 'lavfi', '-i', 'color=c=black:s=640x360:r=2',
      '-i', sourceAudioPath,
      '-t', String(SMOKE_MEDIA_DURATION_SECONDS), '-map', '0:v:0', '-map', '1:a:0',
      '-c:v', 'libx264', '-preset', 'ultrafast', '-pix_fmt', 'yuv420p',
      '-c:a', 'aac', '-ac', '1', '-ar', '16000', outputPath
    ], { maxBuffer: 4 * 1024 * 1024 })
    return
  }

  await access(sourceMediaPath)
  await execFileAsync('ffmpeg', [
    '-hide_banner', '-loglevel', 'error', '-y',
    '-i', sourceMediaPath, '-t', String(SMOKE_MEDIA_DURATION_SECONDS),
    '-c:v', 'libx264', '-preset', 'ultrafast', '-pix_fmt', 'yuv420p',
    '-c:a', 'aac', '-ac', '1', '-ar', '16000', outputPath
  ], { maxBuffer: 4 * 1024 * 1024 })
}

async function launchPlayer(userDataDirectory: string, mediaPath: string): Promise<{ app: ElectronApplication; page: Page; errors: string[] }> {
  const app = await electron.launch({
    args: ['--no-sandbox', '--in-process-gpu', `--user-data-dir=${userDataDirectory}`, 'out/main/index.js', mediaPath],
    env: { ...process.env, HOME: userDataDirectory }
  })
  const page = await app.firstWindow()
  const errors: string[] = []
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(`console: ${message.text()}`)
  })
  page.on('pageerror', (error) => errors.push(`page: ${error.message}`))
  await page.waitForLoadState('domcontentloaded')
  await page.locator('video.video-surface').waitFor({ timeout: 15_000 })
  return { app, page, errors }
}

async function runSmoke(): Promise<void> {
  const resolvedModelRoot = resolve(configuredModelRoot)
  await access(join(resolvedModelRoot, 'models'))

  const smokeDirectory = await mkdtemp(join(tmpdir(), 'aivplayer-smoke-speaker-panel-'))
  const userDataDirectory = join(smokeDirectory, 'user-data')
  const smokeMediaPath = join(smokeDirectory, 'speaker-panel.mp4')
  const modelLink = join(userDataDirectory, 'models')
  await mkdir(userDataDirectory, { recursive: true })
  await symlink(join(resolvedModelRoot, 'models'), modelLink, 'dir')
  await createSmokeMedia(smokeMediaPath)

  let app: ElectronApplication | null = null
  try {
    const session = await launchPlayer(userDataDirectory, smokeMediaPath)
    app = session.app
    const { page } = session

    await page.getByRole('tab', { name: '影视库搜索' }).click()
    const panel = page.locator('.vision-panel')
    await panel.waitFor({ timeout: 10_000 })
    const speakerCard = page.locator('[data-testid="vision-speaker-diarization"]')
    await speakerCard.waitFor({ timeout: 10_000 })
    await page.locator('[data-testid="vision-speaker-diarization"][data-status="ready"]').waitFor({ timeout: 15_000 })

    const status = await page.evaluate(() => window.aiv.getSpeakerDiarizationStatus())
    if (!status.available) throw new Error(`说话人 Provider 未就绪：${JSON.stringify(status)}`)

    const startedAt = Date.now()
    await page.locator('[data-testid="vision-speaker-run"]').click()
    await page.waitForFunction(() => {
      const runButton = document.querySelector('[data-testid="vision-speaker-run"]') as HTMLButtonElement | null
      return Boolean(runButton && !runButton.disabled && document.querySelectorAll('.vision-speaker-segment').length > 0)
    }, undefined, { timeout: 240_000 })

    const segments = await page.locator('.vision-speaker-segment').count()
    if (segments === 0) throw new Error('说话人面板没有生成可跳转的分段')

    await page.locator('video.video-surface').evaluate((video) => { (video as HTMLVideoElement).pause() })
    const firstSegment = await page.locator('.vision-speaker-segment').first().getAttribute('title')
    await page.locator('.vision-speaker-segment').first().click()
    await page.waitForTimeout(250)
    const playback = await page.locator('video.video-surface').evaluate((video) => ({
      currentTime: (video as HTMLVideoElement).currentTime,
      duration: (video as HTMLVideoElement).duration
    }))

    const rendererErrors = session.errors
    if (rendererErrors.length > 0) throw new Error(`说话人面板 Smoke 出现渲染错误：\n${rendererErrors.join('\n')}`)
    console.log(`Speaker diarization panel Smoke passed: ${JSON.stringify({ mediaPath: smokeMediaPath, elapsedMs: Date.now() - startedAt, segments, firstSegment, playback })}`)
  } finally {
    if (app) await app.close().catch(() => undefined)
    await rm(smokeDirectory, { recursive: true, force: true }).catch(() => undefined)
  }
}

runSmoke().catch((error) => {
  console.error(error instanceof Error ? error.stack ?? error.message : String(error))
  process.exitCode = 1
})
