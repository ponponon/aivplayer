import { _electron as electron } from 'playwright'
import { execFile } from 'node:child_process'
import { copyFile, mkdtemp, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { promisify } from 'node:util'

const execFileAsync = promisify(execFile)
const sourceMediaPath = process.argv[2] ?? '/Users/ponponon/Music/aivplayer_test_video_1min.mp4'

async function main(): Promise<void> {
  const smokeDirectory = await mkdtemp(join(tmpdir(), 'aivplayer-smoke-editing-project-repair-'))
  const replacementPath = join(smokeDirectory, 'repair-source.mp4')
  const missingPath = join(smokeDirectory, 'old-location', 'repair-source.mp4')
  const projectPath = join(smokeDirectory, 'repair-summary.aivproj')
  await copyFile(sourceMediaPath, replacementPath)
  const durationSeconds = Number((await execFileAsync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'default=nw=1:nk=1', replacementPath])).stdout.trim())
  if (!Number.isFinite(durationSeconds) || durationSeconds <= 0) throw new Error('Could not read replacement media duration')
  const project = {
    schemaVersion: 1,
    id: 'project-repair-summary',
    title: 'Repair summary Smoke',
    createdAt: 100,
    updatedAt: 100,
    sources: [{ id: 'source-repair-smoke', path: missingPath, name: 'repair-source.mp4', fingerprint: `${missingPath}:${durationSeconds}`, durationSeconds }],
    videoClips: [{ id: 'clip-repair-smoke', sourceId: 'source-repair-smoke', sourceStartSeconds: 0, sourceEndSeconds: durationSeconds }],
    captions: [],
    captionSourcePaths: { 'source-repair-smoke': { source: join(smokeDirectory, 'old-location', 'repair-source.srt'), translation: null } }
  }
  await writeFile(projectPath, `${JSON.stringify(project, null, 2)}\n`, 'utf8')
  const smokeHomeDirectory = await mkdtemp(join(tmpdir(), 'aivplayer-smoke-editing-project-repair-home-'))
  const app = await electron.launch({ args: ['--no-sandbox', '--in-process-gpu', `--user-data-dir=${smokeHomeDirectory}`, 'out/main/index.js', sourceMediaPath], env: { ...process.env, HOME: smokeHomeDirectory } })

  try {
    const page = await app.firstWindow()
    const consoleErrors: string[] = []
    page.on('console', (message) => { if (message.type() === 'error') consoleErrors.push(message.text()) })
    page.on('pageerror', (error) => consoleErrors.push(error.message))
    await page.waitForLoadState('domcontentloaded')
    await page.waitForSelector('video.video-surface', { timeout: 10_000 })
    await page.waitForTimeout(800)
    await page.locator('.clip-editor-tool-button').click()
    await page.locator('[data-testid="editing-timeline"]').waitFor({ timeout: 10_000 })
    await app.evaluate(({ dialog }, paths: string[][]) => {
      let callIndex = 0
      dialog.showOpenDialog = async () => ({ canceled: false, filePaths: paths[Math.min(callIndex++, paths.length - 1)] ?? [] })
    }, [[projectPath], [replacementPath]])
    await page.locator('[data-testid="editing-open-project"]').click()
    await page.waitForFunction(() => document.querySelector('.editing-project-status')?.textContent?.includes('→') === true, null, { timeout: 20_000 })
    const status = await page.locator('.editing-project-status').textContent()
    const stored = await page.evaluate(() => {
      const projects = JSON.parse(localStorage.getItem('aivplayer.editing-projects.v1') ?? '{}') as Record<string, { sources?: Array<{ id: string; path: string }>; captionSourcePaths?: Record<string, { source: string | null; translation: string | null }>; title?: string }>
      return Object.values(projects).find((candidate) => candidate.title === 'Repair summary Smoke') ?? null
    })
    const result = { status: status ?? '', repairedSource: stored?.sources?.find((source) => source.id === 'source-repair-smoke') ?? null, repairedCaptionPaths: stored?.captionSourcePaths?.['source-repair-smoke'] ?? null, consoleErrors }
    console.log(`AIVPlayer Smoke Editing Project Repair\n${JSON.stringify(result)}`)
    if (!status?.includes('→') || !status.includes('固定') || result.repairedSource?.path !== replacementPath || result.repairedSource.id !== 'source-repair-smoke' || result.repairedCaptionPaths?.source !== null || consoleErrors.length > 0) process.exitCode = 1
  } finally {
    await app.close()
  }
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
