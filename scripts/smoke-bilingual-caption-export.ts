import { execFile } from 'node:child_process'
import { copyFile, mkdtemp, rm, stat } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { promisify } from 'node:util'
import { _electron as electron } from 'playwright'

const execFileAsync = promisify(execFile)
const sourceMediaPath = process.argv[2] ?? '/Users/ponponon/Music/aivplayer_test_video_1min.mp4'

async function main(): Promise<void> {
  const ffmpegFilterOutput = await execFileAsync('ffmpeg', ['-hide_banner', '-filters'], { maxBuffer: 4 * 1024 * 1024 }).then(({ stdout, stderr }) => `${stdout}\n${stderr}`).catch(() => '')
  if (!/\bsubtitles\b/u.test(ffmpegFilterOutput)) {
    console.log('Bilingual caption export smoke: {"available":false,"reason":"FFmpeg subtitles/libass filter is unavailable"}')
    return
  }
  const smokeHomeDirectory = await mkdtemp(join(tmpdir(), 'aivplayer-smoke-bilingual-caption-home-'))
  const smokeOutputDirectory = await mkdtemp(join(tmpdir(), 'aivplayer-smoke-bilingual-caption-output-'))
  const mediaPath = join(smokeOutputDirectory, 'source.mp4')
  const outputVideoPath = join(smokeOutputDirectory, 'bilingual-caption.mp4')
  await copyFile(sourceMediaPath, mediaPath)
  const captionAss = String.raw`[Script Info]
ScriptType: v4.00+
PlayResX: 320
PlayResY: 180
ScaledBorderAndShadow: yes

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Alignment, MarginL, MarginR, MarginV, Encoding
Style: Default,Arial,42,&H00FFFFFF,&H00FFFFFF,&H00000000,&H00000000,0,0,5,60,60,54,1
Style: Translation,Arial,30,&H00FFFFFF,&H00FFFFFF,&H00000000,&H00000000,0,0,5,60,60,54,1

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
Dialogue: 0,0:00:00.00,0:00:02.00,Default,,0,0,0,,{\pos(160,137)}Bilingual smoke
Dialogue: 0,0:00:00.00,0:00:02.00,Translation,,0,0,0,,{\pos(160,158)}双语导出烟测
`
  if (!captionAss.includes('Style: Translation') || !captionAss.includes('\\pos(160,158)')) throw new Error('Bilingual ASS layout was not generated')

  const app = await electron.launch({
    args: ['--no-sandbox', '--in-process-gpu', `--user-data-dir=${smokeHomeDirectory}`, 'out/main/index.js', mediaPath],
    env: { ...process.env, HOME: smokeHomeDirectory }
  })

  try {
    const page = await app.firstWindow()
    await page.waitForLoadState('domcontentloaded')
    await page.waitForSelector('video.video-surface', { timeout: 10_000 })
    const exportResult = await page.evaluate(async ({ sourcePath, targetPath, subtitleAssText }) => window.aiv.exportMediaTimeline({
      mediaPath: sourcePath,
      clips: [{ mediaPath: sourcePath, startSeconds: 0, endSeconds: 2 }],
      mode: 'burn-subtitle',
      subtitleAssText,
      targetWidth: 320,
      targetHeight: 180,
      outputVideoPath: targetPath
    }), { sourcePath: mediaPath, targetPath: outputVideoPath, subtitleAssText: captionAss })
    const outputStats = exportResult.success ? await stat(outputVideoPath).catch(() => null) : null
    const probeOutput = outputStats ? await execFileAsync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration:stream=codec_name,width,height', '-of', 'json', outputVideoPath]) : null
    const probe = probeOutput ? JSON.parse(probeOutput.stdout) as { format?: { duration?: string }; streams?: Array<{ codec_name?: string; width?: number; height?: number }> } : null
    const durationSeconds = Number(probe?.format?.duration ?? 0)
    const videoStream = probe?.streams?.find((stream) => stream.width !== undefined && stream.height !== undefined)
    const summary = { success: exportResult.success, message: exportResult.message, outputBytes: outputStats?.size ?? 0, durationSeconds, width: videoStream?.width ?? 0, height: videoStream?.height ?? 0 }
    console.log(`Bilingual caption export smoke: ${JSON.stringify(summary)}`)
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
