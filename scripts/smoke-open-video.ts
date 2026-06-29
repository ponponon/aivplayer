import { _electron as electron } from 'playwright'
import { join } from 'node:path'
import { tmpdir } from 'node:os'

const args = process.argv.slice(2)
const mediaPath = args.find((arg) => arg !== '--check-layout') ?? '/Users/ponponon/Downloads/下载.mp4'

async function readLayoutMetrics(page: any): Promise<{
  workspaceWidth: number
  stageWidth: number
  videoFrameWidth: number
  sidePanelDisplay: string
  sidePanelWidth: number
  asrCardDisplay: string
  asrCardHeight: number
}> {
  return page.evaluate(() => {
    const workspace = document.querySelector('.workspace') as HTMLElement | null
    const stage = document.querySelector('.stage') as HTMLElement | null
    const videoFrame = document.querySelector('.video-frame') as HTMLElement | null
    const sidePanel = document.querySelector('.side-panel') as HTMLElement | null
    const asrCard = document.querySelector('.asr-card') as HTMLElement | null

    if (!workspace || !stage || !videoFrame || !sidePanel) {
      throw new Error('Missing expected player layout elements')
    }

    const sideStyle = window.getComputedStyle(sidePanel)
    const asrStyle = asrCard ? window.getComputedStyle(asrCard) : null

    return {
      workspaceWidth: workspace.getBoundingClientRect().width,
      stageWidth: stage.getBoundingClientRect().width,
      videoFrameWidth: videoFrame.getBoundingClientRect().width,
      sidePanelDisplay: sideStyle.display,
      sidePanelWidth: sidePanel.getBoundingClientRect().width,
      asrCardDisplay: asrStyle?.display ?? 'none',
      asrCardHeight: asrCard?.getBoundingClientRect().height ?? 0
    }
  })
}

async function seekWithTimeline(page: any, targetSeconds: number): Promise<{
  targetSeconds: number
  currentTime: number
  seekableEnd: number
  timelineValue: number
}> {
  await page.locator('input.timeline').evaluate((input: HTMLInputElement, target: number) => {
    const valueSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')?.set
    valueSetter?.call(input, String(target))
    input.dispatchEvent(new Event('input', { bubbles: true }))
    input.dispatchEvent(new Event('change', { bubbles: true }))
  }, targetSeconds)

  await page.waitForTimeout(1200)

  return page.evaluate((target: number) => {
    const video = document.querySelector('video.video-surface') as HTMLVideoElement | null
    const timeline = document.querySelector('input.timeline') as HTMLInputElement | null

    if (!video || !timeline) {
      throw new Error('Missing video or timeline while checking seek behavior')
    }

    return {
      targetSeconds: target,
      currentTime: video.currentTime,
      seekableEnd: video.seekable.length > 0 ? video.seekable.end(video.seekable.length - 1) : 0,
      timelineValue: timeline.valueAsNumber
    }
  }, targetSeconds)
}

async function main(): Promise<void> {
  const app = await electron.launch({
    args: ['out/main/index.js', mediaPath]
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
    await page.waitForTimeout(1_000)

    const initialFiles = await page.evaluate(() => window.aiv.getInitialMediaFiles())
    console.log(`Initial files from IPC: ${JSON.stringify(initialFiles)}`)

    const hasVideo = await page.locator('video.video-surface').count()
    if (hasVideo === 0) {
      const bodyText = await page.locator('body').innerText()
      console.log(`Body text: ${bodyText}`)
      console.log('AIVPlayer Smoke Open Video')
      console.log(`Media: ${mediaPath}`)
      console.log('Video surface: not found')
      process.exitCode = 1
      return
    }

    const videoSrc = await page.locator('video.video-surface').evaluate((video) => {
      return (video as HTMLVideoElement).currentSrc
    })

    await page.waitForTimeout(5_000)

    const statusText = await page.locator('.status-banner').textContent({ timeout: 10_000 }).catch(() => null)
    const videoCountAfterPlay = await page.locator('video.video-surface').count()
    const videoState =
      videoCountAfterPlay > 0
        ? await page.locator('video.video-surface').evaluate((video) => {
            const element = video as HTMLVideoElement
            return {
              currentTime: element.currentTime,
              duration: element.duration,
              paused: element.paused,
              ended: element.ended,
              readyState: element.readyState,
              networkState: element.networkState,
              errorCode: element.error?.code ?? null,
              errorMessage: element.error?.message ?? null
            }
          })
        : {
            bodyText: await page.locator('body').innerText()
          }
    const stopResult = await page.evaluate(() => window.aiv.stopNativePlayer())

    console.log('AIVPlayer Smoke Open Video')
    console.log(`Media: ${mediaPath}`)
    console.log(`Video src: ${videoSrc}`)
    console.log(`Status banner: ${statusText ?? 'not shown'}`)
    console.log(`Video state: ${JSON.stringify(videoState)}`)
    console.log(`Stop native player: ${stopResult.message}`)

    if (!videoSrc.startsWith('aiv-media://')) {
      process.exitCode = 1
    }

    if (statusText?.includes('URL safety check')) {
      process.exitCode = 1
    }

    const playbackAdvanced =
      'currentTime' in videoState &&
      (videoState.currentTime > 0 || videoState.ended || videoState.currentTime >= videoState.duration - 0.25)
    const playbackActiveOrCompleted = 'ended' in videoState && (!videoState.paused || videoState.ended)

    if (!playbackAdvanced || !playbackActiveOrCompleted || !('errorCode' in videoState) || videoState.errorCode !== null) {
      process.exitCode = 1
    }

    const seekDuration = 'duration' in videoState && Number.isFinite(videoState.duration) ? videoState.duration : 0
    const seekTarget = seekDuration > 8 ? Math.min(Math.max(seekDuration * 0.45, 4), seekDuration - 2) : 0
    const seekResult = seekTarget > 0 ? await seekWithTimeline(page, seekTarget) : null

    const hasPlaylistTabInitially = await page.getByRole('tab', { name: '播放列表' }).count()
    const hasAsrTabInitially = await page.getByRole('tab', { name: 'ASR' }).count()
    await page.getByRole('tab', { name: '播放列表' }).click()
    await page.waitForTimeout(250)
    const expanded = await readLayoutMetrics(page)
    await page.getByTitle('Toggle playlist').click()
    await page.waitForTimeout(250)
    const collapsed = await readLayoutMetrics(page)

    await page.getByTitle('Toggle playlist').click()
    await page.waitForTimeout(250)
    const asrHidden = await readLayoutMetrics(page)
    await page.getByTitle('ASR subtitles').click()
    await page.waitForTimeout(250)
    const asrVisible = await readLayoutMetrics(page)
    const hasDownloadModelButton = await page.getByRole('button', { name: '下载推荐模型' }).count()
    const hasRedownloadModelButton = await page.getByRole('button', { name: '重新下载 / 更换来源' }).count()
    const hasInstalledModelPill = await page.locator('.asr-status-pill', { hasText: '模型文件已安装' }).count()
    const hasGenerateSubtitleButton = await page.getByRole('button', { name: '生成当前视频字幕' }).count()
    const runtimeGridText = await page.locator('.asr-runtime-grid').innerText()
    const hasAsrEngineStatus = runtimeGridText.includes('ASR 引擎 whisper.cpp')
    const hasFfmpegStatus = runtimeGridText.includes('ffmpeg')
    const hasWhisperBinaryPicker = await page
      .getByRole('button', { name: /选择 whisper-cli|更换 ASR 引擎/ })
      .count()
    const hasWhisperAutoDetect = await page.getByRole('button', { name: '自动检测 whisper-cli' }).count()
    const asrPanelScreenshotPath = join(tmpdir(), 'aivplayer-smoke-asr-panel-state.png')
    await page.screenshot({ path: asrPanelScreenshotPath, fullPage: false })

    await page.waitForFunction(() => {
      const button = Array.from(document.querySelectorAll('button')).find((item) =>
        item.textContent?.includes('下载推荐模型') || item.textContent?.includes('重新下载 / 更换来源')
      ) as HTMLButtonElement | undefined

      return Boolean(button && !button.disabled)
    })
    await page.getByRole('button', { name: /下载推荐模型|重新下载 \/ 更换来源/ }).click()
    await page.waitForTimeout(250)
    const hasDownloadDialog = await page.getByRole('dialog', { name: '选择 ASR 模型下载源' }).count()
    const hasModelScopeSource = await page.getByRole('button', { name: '从 ModelScope 下载推荐 ASR 模型' }).count()
    const hasHuggingFaceSource = await page.getByRole('button', { name: '从 Hugging Face 下载推荐 ASR 模型' }).count()
    const hasDomesticHint = await page.getByText('中国大陆网络建议走阿里云 ModelScope').count()
    const screenshotPath = join(tmpdir(), 'aivplayer-smoke-asr-dialog.png')
    await page.screenshot({ path: screenshotPath, fullPage: false })

    console.log(`Expanded layout: ${JSON.stringify(expanded)}`)
    console.log(`Collapsed layout: ${JSON.stringify(collapsed)}`)
    console.log(`ASR hidden layout: ${JSON.stringify(asrHidden)}`)
    console.log(`ASR visible layout: ${JSON.stringify(asrVisible)}`)
    console.log(`Seek result: ${JSON.stringify(seekResult)}`)
    console.log(`Panel tabs: ${JSON.stringify({ hasPlaylistTabInitially, hasAsrTabInitially })}`)
    console.log(
      `ASR controls: ${JSON.stringify({
        hasDownloadModelButton,
        hasRedownloadModelButton,
        hasInstalledModelPill,
        hasGenerateSubtitleButton,
        hasAsrEngineStatus,
        hasFfmpegStatus,
        hasWhisperBinaryPicker,
        hasWhisperAutoDetect
      })}`
    )
    console.log(
      `Download source dialog: ${JSON.stringify({
        hasDownloadDialog,
        hasModelScopeSource,
        hasHuggingFaceSource,
        hasDomesticHint
      })}`
    )
    console.log(`ASR panel screenshot: ${asrPanelScreenshotPath}`)
    console.log(`Download dialog screenshot: ${screenshotPath}`)

    if (expanded.sidePanelDisplay === 'none' || expanded.sidePanelWidth < 280) {
      process.exitCode = 1
    }

    if (hasPlaylistTabInitially !== 1 || hasAsrTabInitially !== 1) {
      process.exitCode = 1
    }

    if (collapsed.sidePanelDisplay !== 'none') {
      process.exitCode = 1
    }

    if (collapsed.stageWidth <= expanded.stageWidth + 250) {
      process.exitCode = 1
    }

    if (collapsed.videoFrameWidth <= expanded.videoFrameWidth + 250) {
      process.exitCode = 1
    }

    if (Math.abs(collapsed.stageWidth - collapsed.workspaceWidth) > 1) {
      process.exitCode = 1
    }

    if (asrHidden.asrCardDisplay !== 'none' || asrHidden.asrCardHeight !== 0) {
      process.exitCode = 1
    }

    if (asrVisible.asrCardDisplay === 'none' || asrVisible.asrCardHeight <= 0) {
      process.exitCode = 1
    }

    if (
      hasDownloadModelButton + hasRedownloadModelButton !== 1 ||
      hasGenerateSubtitleButton !== 1 ||
      !hasAsrEngineStatus ||
      !hasFfmpegStatus ||
      hasWhisperBinaryPicker !== 1 ||
      hasWhisperAutoDetect !== 1
    ) {
      process.exitCode = 1
    }

    if (hasDownloadDialog !== 1 || hasModelScopeSource !== 1 || hasHuggingFaceSource !== 1 || hasDomesticHint < 1) {
      process.exitCode = 1
    }

    if (
      seekResult &&
      (seekResult.seekableEnd < seekTarget ||
        Math.abs(seekResult.currentTime - seekTarget) > 3 ||
        Math.abs(seekResult.timelineValue - seekTarget) > 3)
    ) {
      process.exitCode = 1
    }
  } finally {
    await app.close()
  }
}

void main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
