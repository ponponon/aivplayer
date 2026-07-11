import { _electron as electron } from 'playwright'
import { access, mkdtemp, readdir, readFile, rm, stat } from 'node:fs/promises'
import { homedir, tmpdir } from 'node:os'
import { join } from 'node:path'
import { getWhisperModelDirectory } from '../src/main/ai/model-manager.ts'
import { getRecommendedWhisperModelManifest } from '../src/main/ai/asr-models.ts'

const mediaPath = process.argv.find((argument) => argument.toLowerCase().endsWith('.mp4')) ?? '/Users/ponponon/Downloads/下载.mp4'
const modelManifest = getRecommendedWhisperModelManifest()

function getDefaultUserDataPath(): string {
  if (process.platform === 'darwin') {
    return join(homedir(), 'Library', 'Application Support', 'AIVPlayer')
  }

  if (process.platform === 'win32') {
    return join(process.env.APPDATA || homedir(), 'AIVPlayer')
  }

  return join(process.env.XDG_CONFIG_HOME || join(homedir(), '.config'), 'AIVPlayer')
}

const modelDirectory = process.env.AIVPLAYER_ASR_MODEL_DIR || getWhisperModelDirectory(getDefaultUserDataPath())
const modelPath = join(modelDirectory, modelManifest.fileName)
const userDataDirectory = await mkdtemp(join(tmpdir(), 'aivplayer-smoke-asr-real-user-data-'))
const cacheDirectory = join(userDataDirectory, 'asr-cache')
let app: Awaited<ReturnType<typeof electron.launch>> | null = null

try {
  await access(modelPath)
  await stat(mediaPath)

  app = await electron.launch({
    args: [`--user-data-dir=${userDataDirectory}`, 'out/main/index.js', mediaPath],
    env: {
      ...process.env,
      AIVPLAYER_ASR_CACHE_DIR: cacheDirectory,
      AIVPLAYER_ASR_MODEL_DIR: modelDirectory
    }
  })

  const page = await app.firstWindow()
  await page.waitForLoadState('domcontentloaded')
  await page.waitForSelector('video.video-surface', { timeout: 10_000 })

  await page.evaluate(async () => {
    const current = await window.aiv.getAppSettings()
    await window.aiv.setAppSettings({
      ...current,
      ui: {
        ...current.ui,
        locale: 'zh-CN'
      }
    })
  })
  await page.reload({ waitUntil: 'domcontentloaded' })
  await page.waitForSelector('video.video-surface', { timeout: 10_000 })

  await page.getByRole('tab', { name: 'ASR 面板' }).click()
  await page.getByText('模型文件已安装', { exact: true }).waitFor({ state: 'visible', timeout: 10_000 })
  await page.getByRole('button', { name: '生成字幕', exact: true }).click()
  await page.locator('.asr-result.success', { hasText: '字幕生成完成，VTT 已挂载，SRT 已导出。' }).waitFor({
    state: 'visible',
    timeout: 60_000
  })
  await page.locator('.subtitle-status.ready').waitFor({ state: 'visible', timeout: 10_000 })

  const subtitleDirectory = join(cacheDirectory, 'subtitles')
  const subtitleFiles = await readdir(subtitleDirectory)
  const vttFile = subtitleFiles.find((fileName) => fileName.endsWith('.vtt'))
  const srtFile = subtitleFiles.find((fileName) => fileName.endsWith('.srt'))
  const jsonFile = subtitleFiles.find((fileName) => fileName.endsWith('.json'))

  if (!vttFile || !srtFile || !jsonFile) {
    throw new Error(`Real ASR did not create the expected VTT / SRT / JSON files: ${subtitleFiles.join(', ')}`)
  }

  const subtitleText = await readFile(join(subtitleDirectory, vttFile), 'utf8')
  const metadata = JSON.parse(await readFile(join(subtitleDirectory, jsonFile), 'utf8')) as {
    result?: { language?: string }
  }
  const overlayText = await page.locator('.subtitle-text').innerText()
  const screenshotPath = join(tmpdir(), `aivplayer-smoke-asr-real-${Date.now()}.png`)
  await page.screenshot({ path: screenshotPath, fullPage: false })

  const recognizedCueText = subtitleText
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line && line !== 'WEBVTT' && !line.includes('-->') && !/^\d+$/.test(line))
    .join(' ')

  if (!recognizedCueText) {
    throw new Error(`Real ASR VTT did not contain recognized cue text: ${subtitleText}`)
  }

  console.log(`Real ASR player flow passed for: ${mediaPath}`)
  console.log(`Detected language: ${metadata.result?.language ?? 'unknown'}`)
  console.log(`Recognized cue: ${recognizedCueText}`)
  console.log(`Overlay: ${overlayText}`)
  console.log(`VTT: ${join(subtitleDirectory, vttFile)}`)
  console.log(`SRT: ${join(subtitleDirectory, srtFile)}`)
  console.log(`Screenshot: ${screenshotPath}`)
} finally {
  await app?.close()
  await rm(userDataDirectory, { recursive: true, force: true })
}
