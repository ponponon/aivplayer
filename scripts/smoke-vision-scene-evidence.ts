import { execFile } from 'node:child_process'
import { mkdir, mkdtemp, rm, stat } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { promisify } from 'node:util'
import { connect } from '@lancedb/lancedb'
import { _electron as electron, type ElectronApplication, type Page } from 'playwright'
import { VISION_MODEL_ID, VISION_MODEL_VARIANT, type VisionIndexProgress } from '../src/shared/vision-types.ts'

const execFileAsync = promisify(execFile)
const mediaPathArgument = process.argv[2]

async function createVideo(outputPath: string): Promise<void> {
  await execFileAsync('ffmpeg', [
    '-hide_banner', '-loglevel', 'error', '-y',
    '-f', 'lavfi', '-i', 'color=c=red:s=640x360:r=6:d=1',
    '-f', 'lavfi', '-i', 'color=c=blue:s=640x360:r=6:d=1',
    '-filter_complex', '[0:v][1:v]concat=n=2:v=1:a=0,format=yuv420p',
    '-c:v', 'libx264', '-pix_fmt', 'yuv420p', outputPath
  ], { maxBuffer: 4 * 1024 * 1024 })
}

async function seedUnchangedSource(userDataDirectory: string, mediaPath: string): Promise<void> {
  const file = await stat(mediaPath)
  const databaseDirectory = join(userDataDirectory, 'library', 'vision', 'lancedb')
  await mkdir(databaseDirectory, { recursive: true })
  const database = await connect(databaseDirectory)
  await database.createTable('video_sources', [{
    id: 'smoke-source',
    video_path: mediaPath,
    file_name: 'scene-evidence.mp4',
    file_size_bytes: file.size,
    file_mtime_ms: file.mtimeMs,
    sample_interval_seconds: 1,
    subtitle_path: '',
    subtitle_size_bytes: 0,
    subtitle_mtime_ms: 0,
    frame_count: 1,
    model_id: VISION_MODEL_ID,
    model_variant: VISION_MODEL_VARIANT,
    indexed_at_ms: Date.now() - 1_000
  }])
  await database.createTable('video_frames', [{
    id: 'smoke-frame',
    video_path: mediaPath,
    file_name: 'scene-evidence.mp4',
    timestamp_seconds: 0.5,
    thumbnail_path: ''
  }])
}

async function launchPlayer(userDataDirectory: string, mediaPath: string): Promise<{ app: ElectronApplication; page: Page; errors: string[] }> {
  const app = await electron.launch({
    args: ['--no-sandbox', '--in-process-gpu', `--user-data-dir=${userDataDirectory}`, 'out/main/index.js', mediaPath],
    env: { ...process.env, HOME: userDataDirectory }
  })
  const page = await app.firstWindow()
  const errors: string[] = []
  page.on('console', (message) => { if (message.type() === 'error') errors.push(`console: ${message.text()}`) })
  page.on('pageerror', (error) => errors.push(`page: ${error.message}`))
  await page.waitForLoadState('domcontentloaded')
  await page.locator('video.video-surface').waitFor({ timeout: 15_000 })
  return { app, page, errors }
}

async function runSmoke(): Promise<void> {
  const smokeDirectory = await mkdtemp(join(tmpdir(), 'aivplayer-smoke-vision-scene-evidence-files-'))
  const userDataDirectory = await mkdtemp(join(tmpdir(), 'aivplayer-smoke-vision-scene-evidence-user-data-'))
  const mediaPath = mediaPathArgument ?? join(smokeDirectory, 'scene-evidence.mp4')
  let app: ElectronApplication | null = null

  try {
    if (!mediaPathArgument) await createVideo(mediaPath)
    await seedUnchangedSource(userDataDirectory, mediaPath)
    const session = await launchPlayer(userDataDirectory, mediaPath)
    app = session.app
    const page = session.page
    await page.getByRole('tab', { name: '影视库搜索' }).click()
    await page.locator('.vision-panel').waitFor({ timeout: 15_000 })
    await page.evaluate(() => {
      const events: VisionIndexProgress[] = []
      ;(window as typeof window & { __visionSceneProgress?: VisionIndexProgress[] }).__visionSceneProgress = events
      window.aiv.onVisionIndexProgress((progress) => events.push(progress))
    })
    await page.evaluate((path) => {
      void window.aiv.startVisionIndex({ mediaPaths: [path], intervalSeconds: 1, includeSceneEvidence: true })
    }, mediaPath)
    await page.waitForFunction(() => {
      const events = (window as typeof window & { __visionSceneProgress?: VisionIndexProgress[] }).__visionSceneProgress ?? []
      return events.some((event) => event.stage === 'scene-evidence') && events.some((event) => event.status === 'completed')
    }, undefined, { timeout: 120_000 })

    const diagnostics = await page.evaluate(async () => {
      const progress = (window as typeof window & { __visionSceneProgress?: VisionIndexProgress[] }).__visionSceneProgress ?? []
      const evidenceSources = await window.aiv.listVisionEvidenceSources({ evidenceTypes: ['scene'], limit: 10 })
      const results = await window.aiv.searchVisionText({ query: 'scene segment', limit: 10, mode: 'hybrid', evidenceTypes: ['scene'] })
      return { progress, evidenceSources, results }
    })
    const sceneProgress = diagnostics.progress.find((event) => event.stage === 'scene-evidence' && event.currentVideoPath === mediaPath)
    const completed = diagnostics.progress.find((event) => event.status === 'completed' && event.stage === 'completed')
    const source = diagnostics.evidenceSources.find((item) => item.videoPath === mediaPath)
    const result = diagnostics.results.find((item) => item.videoPath === mediaPath && item.evidenceType === 'scene')
    if (!sceneProgress || sceneProgress.sceneEvidenceProcessed !== 1 || !completed || completed.status !== 'completed' || completed.sceneEvidenceCount !== source?.evidenceCounts.scene) {
      throw new Error(`Scene evidence progress or source aggregation mismatch: ${JSON.stringify({ sceneProgress, completed, evidenceSources: diagnostics.evidenceSources })}`)
    }
    if (!source || source.evidenceCounts.scene < 1 || !result || result.startSeconds !== 0 || !result.endSeconds || result.endSeconds <= result.startSeconds) {
      throw new Error(`Scene evidence was not searchable with a bounded range: ${JSON.stringify({ source, result, results: diagnostics.results })}`)
    }
    if (session.errors.length > 0) throw new Error(`Renderer errors during vision scene evidence smoke:\n${session.errors.join('\n')}`)
    console.log(`AIVPlayer Smoke Vision Scene Evidence passed: ${JSON.stringify({ sceneEvidenceCount: source.evidenceCounts.scene, searchable: true, boundedRange: [result.startSeconds, result.endSeconds], cancelled: false })}`)
  } finally {
    if (app) await app.close().catch(() => undefined)
    await rm(smokeDirectory, { recursive: true, force: true }).catch(() => undefined)
    await rm(userDataDirectory, { recursive: true, force: true }).catch(() => undefined)
  }
}

runSmoke().catch((error) => {
  console.error(error instanceof Error ? error.stack ?? error.message : String(error))
  process.exitCode = 1
})
