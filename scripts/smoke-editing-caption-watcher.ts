import { _electron as electron } from 'playwright'
import { copyFile, mkdtemp, rm, utimes, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'

const sourceMediaPath = process.argv[2] ?? '/Users/ponponon/Music/aivplayer_test_video_1min.mp4'

function makeVtt(text: string): string {
  return `WEBVTT\n\n00:00:00.000 --> 00:00:01.000\n${text}\n`
}

type StoredProject = {
  captionSourceRevision?: string
  captionSourceRevisions?: Record<string, { source: number | null; translation: number | null }>
  captions: Array<{ text: string }>
}

async function main(): Promise<void> {
  const smokeDirectory = await mkdtemp(join(tmpdir(), 'aivplayer-smoke-caption-watcher-'))
  const homeDirectory = await mkdtemp(join(tmpdir(), 'aivplayer-smoke-caption-watcher-home-'))
  const mediaPath = join(smokeDirectory, 'caption-watcher-smoke.mp4')
  const sourcePath = join(smokeDirectory, 'caption-watcher-smoke.vtt')
  const translationPath = join(smokeDirectory, 'caption-watcher-smoke.zh-CN.vtt')
  await copyFile(sourceMediaPath, mediaPath)
  await writeFile(sourcePath, makeVtt('旁车监听初始原文'))
  await writeFile(translationPath, makeVtt('旁车监听初始译文'))

  let app: Awaited<ReturnType<typeof electron.launch>> | null = null
  try {
    app = await electron.launch({
      args: ['--no-sandbox', '--in-process-gpu', `--user-data-dir=${homeDirectory}`, 'out/main/index.js', mediaPath],
      env: { ...process.env, HOME: homeDirectory }
    })
    const page = await app.firstWindow()
    const consoleErrors: string[] = []
    let navigationsAfterBaseline = 0
    page.on('console', (message) => { if (message.type() === 'error') consoleErrors.push(message.text()) })
    page.on('pageerror', (error) => consoleErrors.push(error.message))
    page.on('framenavigated', () => { navigationsAfterBaseline += 1 })

    await page.waitForLoadState('domcontentloaded')
    await page.waitForSelector('video.video-surface', { timeout: 10_000 })
    await page.locator('.clip-editor-tool-button').click()
    await page.locator('[data-testid="editing-timeline"]').waitFor({ timeout: 10_000 })
    await page.locator('[data-testid^="editing-script-row-"]').first().waitFor({ timeout: 10_000 })
    await page.waitForFunction(() => {
      const entries = Object.values(JSON.parse(localStorage.getItem('aivplayer.editing-projects.v1') ?? '{}') as Record<string, StoredProject>)
      return entries.some((project) => Boolean(project.captionSourceRevision && project.captionSourceRevisions && project.captions.some((caption) => caption.text.includes('旁车监听初始原文'))))
    }, undefined, { timeout: 10_000 })
    navigationsAfterBaseline = 0
    await page.waitForTimeout(150)

    const revisionMs = Date.now() + 5_000
    await writeFile(sourcePath, makeVtt('旁车监听更新原文'))
    await writeFile(translationPath, makeVtt('旁车监听更新译文'))
    await utimes(sourcePath, new Date(revisionMs), new Date(revisionMs))
    await utimes(translationPath, new Date(revisionMs + 1_000), new Date(revisionMs + 1_000))

    const conflict = page.locator('[data-testid="editing-caption-reload-conflict"]')
    await conflict.waitFor({ timeout: 10_000 })
    const conflictRows = await conflict.locator('.editing-caption-reload-row').count()
    const incomingText = await conflict.textContent()
    await page.locator('[data-testid="editing-caption-reload-keep"]').click()
    await conflict.waitFor({ state: 'detached', timeout: 10_000 })

    const result = { conflictRows, incomingText, navigationsAfterBaseline, consoleErrors }
    console.log('AIVPlayer Smoke Editing Caption Watcher')
    console.log(JSON.stringify(result))
    if (result.conflictRows !== 2 || !result.incomingText?.includes('旁车监听更新原文') || !result.incomingText.includes('旁车监听更新译文') || result.navigationsAfterBaseline !== 0 || result.consoleErrors.length > 0) process.exitCode = 1
  } finally {
    if (app) await app.close()
    await rm(smokeDirectory, { recursive: true, force: true })
    await rm(homeDirectory, { recursive: true, force: true })
  }
}

void main()
