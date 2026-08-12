import { execFile } from 'node:child_process'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { promisify } from 'node:util'
import { _electron as electron, type ElectronApplication, type Page } from 'playwright'
import type { TaskCenterEvent } from '../src/shared/task-center-types.ts'
import type { VisionIndexProgress } from '../src/shared/vision-types.ts'

const execFileAsync = promisify(execFile)
const sourceImagePath = process.argv[2] ?? '/Users/ponponon/Pictures/loopy.jpg'

async function createVideo(outputPath: string): Promise<void> {
  await execFileAsync('ffmpeg', [
    '-hide_banner', '-loglevel', 'error', '-y',
    '-loop', '1', '-i', sourceImagePath,
    '-t', '2', '-vf', 'scale=640:-2,format=yuv420p',
    '-r', '1', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', outputPath
  ], { maxBuffer: 4 * 1024 * 1024 })
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
  const smokeDirectory = await mkdtemp(join(tmpdir(), 'aivplayer-smoke-vision-index-coordinator-files-'))
  const userDataDirectory = await mkdtemp(join(tmpdir(), 'aivplayer-smoke-vision-index-coordinator-user-data-'))
  const firstMediaPath = join(smokeDirectory, 'coordinator-first.mp4')
  const secondMediaPath = join(smokeDirectory, 'coordinator-second.mp4')
  let app: ElectronApplication | null = null

  try {
    await createVideo(firstMediaPath)
    await createVideo(secondMediaPath)
    const session = await launchPlayer(userDataDirectory, firstMediaPath)
    app = session.app
    const page = session.page
    await page.getByRole('tab', { name: '影视库搜索' }).click()
    await page.locator('.vision-panel').waitFor({ timeout: 15_000 })
    await page.evaluate(() => {
      const progressEvents: VisionIndexProgress[] = []
      const taskEvents: TaskCenterEvent[] = []
      window.aiv.onVisionIndexProgress((progress) => progressEvents.push(progress))
      window.aiv.onTaskCenterEvent((event) => { if (event.kind === 'vision-index') taskEvents.push(event) })
      const smokeWindow = window as typeof window & { __visionCoordinatorProgress?: VisionIndexProgress[]; __visionCoordinatorTasks?: TaskCenterEvent[] }
      smokeWindow.__visionCoordinatorProgress = progressEvents
      smokeWindow.__visionCoordinatorTasks = taskEvents
    })

    await page.evaluate((mediaPath) => {
      void window.aiv.startVisionIndex({ mediaPaths: [mediaPath], intervalSeconds: 1 })
    }, firstMediaPath)
    await page.waitForFunction((mediaPath) => {
      const events = (window as typeof window & { __visionCoordinatorProgress?: VisionIndexProgress[] }).__visionCoordinatorProgress ?? []
      return events.some((event) => event.currentVideoPath === mediaPath && event.stage === 'frames')
    }, firstMediaPath, { timeout: 120_000 })

    const queued = await page.evaluate((mediaPath) => window.aiv.enqueueVisionIndex({ mediaPaths: [mediaPath], intervalSeconds: 1 }), secondMediaPath)
    if (!queued) throw new Error('Vision index coordinator rejected the automatic queue request')
    await page.waitForFunction(() => {
      const events = (window as typeof window & { __visionCoordinatorProgress?: VisionIndexProgress[] }).__visionCoordinatorProgress ?? []
      return events.filter((event) => event.status === 'completed').length >= 2
    }, undefined, { timeout: 180_000 })

    const diagnostics = await page.evaluate(() => {
      const smokeWindow = window as typeof window & { __visionCoordinatorProgress?: VisionIndexProgress[]; __visionCoordinatorTasks?: TaskCenterEvent[] }
      return { progress: smokeWindow.__visionCoordinatorProgress ?? [], tasks: smokeWindow.__visionCoordinatorTasks ?? [], status: null }
    })
    const firstCompletedIndex = diagnostics.progress.findIndex((event) => event.status === 'completed')
    const secondStartedIndex = diagnostics.progress.findIndex((event) => event.currentVideoPath === secondMediaPath)
    const firstTaskCompletedIndex = diagnostics.tasks.findIndex((event) => event.status === 'completed')
    const secondTaskStartedIndex = diagnostics.tasks.findIndex((event) => event.current === 'coordinator-second.mp4' && event.status === 'running')
    if (firstCompletedIndex < 0 || secondStartedIndex <= firstCompletedIndex) {
      throw new Error(`Vision progress interleaved or missing: ${JSON.stringify({ firstCompletedIndex, secondStartedIndex, progress: diagnostics.progress })}`)
    }
    if (firstTaskCompletedIndex < 0 || secondTaskStartedIndex <= firstTaskCompletedIndex) {
      throw new Error(`Task center progress interleaved or missing: ${JSON.stringify({ firstTaskCompletedIndex, secondTaskStartedIndex, tasks: diagnostics.tasks })}`)
    }
    if (session.errors.length > 0) throw new Error(`Renderer errors during vision index coordinator smoke:\n${session.errors.join('\n')}`)
    console.log(`AIVPlayer Smoke Vision Index Coordinator passed: ${JSON.stringify({ manualCompletedBeforeAutomatic: true, progressEvents: diagnostics.progress.length, taskEvents: diagnostics.tasks.length, maxConcurrentJobs: 1 })}`)
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
