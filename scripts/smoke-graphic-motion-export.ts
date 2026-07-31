import { execFile } from 'node:child_process'
import { copyFile, mkdtemp, rm, stat } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { promisify } from 'node:util'
import { _electron as electron } from 'playwright'

const execFileAsync = promisify(execFile)
const sourceMediaPath = process.argv[2] ?? '/Users/ponponon/Music/aivplayer_test_video_1min.mp4'

async function main(): Promise<void> {
  const smokeHomeDirectory = await mkdtemp(join(tmpdir(), 'aivplayer-smoke-graphic-motion-home-'))
  const smokeOutputDirectory = await mkdtemp(join(tmpdir(), 'aivplayer-smoke-graphic-motion-output-'))
  const mediaPath = join(smokeOutputDirectory, 'source.mp4')
  const outputVideoPath = join(smokeOutputDirectory, 'graphic-motion.mp4')
  await copyFile(sourceMediaPath, mediaPath)

  const app = await electron.launch({
    args: ['--no-sandbox', '--in-process-gpu', `--user-data-dir=${smokeHomeDirectory}`, 'out/main/index.js', mediaPath],
    env: { ...process.env, HOME: smokeHomeDirectory }
  })

  try {
    const page = await app.firstWindow()
    await page.waitForLoadState('domcontentloaded')
    await page.waitForSelector('video.video-surface', { timeout: 10_000 })
    const exportResult = await page.evaluate(async ({ sourcePath, targetPath }) => window.aiv.exportMediaTimeline({
      mediaPath: sourcePath,
      clips: [{ mediaPath: sourcePath, startSeconds: 0, endSeconds: 2 }],
      graphics: [{ id: 'graphic-motion-smoke', startSeconds: 0.25, durationSeconds: 1.25, text: 'Motion smoke', position: 'center', style: 'title', enterMotion: 'slide-left', exitMotion: 'fade', motionDurationSeconds: 0.5 }],
      frameId: 'warm',
      targetWidth: 320,
      targetHeight: 180,
      mode: 'video',
      outputVideoPath: targetPath
    }), { sourcePath: mediaPath, targetPath: outputVideoPath })
    const outputStats = exportResult.success ? await stat(outputVideoPath).catch(() => null) : null
    const probeOutput = outputStats ? await execFileAsync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration:stream=codec_name,width,height', '-of', 'json', outputVideoPath]) : null
    const probe = probeOutput ? JSON.parse(probeOutput.stdout) as { format?: { duration?: string }; streams?: Array<{ codec_name?: string; width?: number; height?: number }> } : null
    const durationSeconds = Number(probe?.format?.duration ?? 0)
    const videoStream = probe?.streams?.find((stream) => stream.width !== undefined && stream.height !== undefined)
    const summary = { success: exportResult.success, message: exportResult.message, outputBytes: outputStats?.size ?? 0, durationSeconds, width: videoStream?.width ?? 0, height: videoStream?.height ?? 0 }
    console.log(`Graphic motion export smoke: ${JSON.stringify(summary)}`)
    if (!exportResult.success || !outputStats || outputStats.size <= 0 || durationSeconds < 1.8 || durationSeconds > 2.2 || videoStream?.width !== 320 || videoStream?.height !== 180) process.exitCode = 1
  } finally {
    await app.close()
    await Promise.all([
      rm(smokeHomeDirectory, { recursive: true, force: true }),
      rm(smokeOutputDirectory, { recursive: true, force: true })
    ])
  }
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
