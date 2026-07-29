import { _electron as electron } from 'playwright'
import { copyFile, mkdtemp, stat, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'

const sourceMediaPath = process.argv[2] ?? '/Users/ponponon/Music/aivplayer_test_video_1min.mp4'

async function main(): Promise<void> {
  const smokeDirectory = await mkdtemp(join(tmpdir(), 'aivplayer-smoke-editing-script-'))
  const mediaPath = join(smokeDirectory, 'script-smoke.mp4')
  await copyFile(sourceMediaPath, mediaPath)
  await writeFile(join(smokeDirectory, 'script-smoke.srt'), [
    '1',
    '00:00:00,000 --> 00:00:02,000',
    '第一句脚本',
    '',
    '2',
    '00:00:04,000 --> 00:00:06,000',
    '第二句脚本',
    '',
    '3',
    '00:00:08,000 --> 00:00:10,000',
    '第三句脚本',
    ''
  ].join('\n'))
  const smokeHomeDirectory = await mkdtemp(join(tmpdir(), 'aivplayer-smoke-editing-script-home-'))

  const app = await electron.launch({
    args: [`--user-data-dir=${smokeHomeDirectory}`, 'out/main/index.js', mediaPath],
    env: { ...process.env, HOME: smokeHomeDirectory }
  })

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
    await page.waitForFunction(() => document.querySelectorAll('[data-testid="editing-script-list"] .editing-script-row').length === 3, null, { timeout: 10_000 })
    await page.waitForFunction(() => { const images = Array.from(document.querySelectorAll('.editing-clip-filmstrip img')) as HTMLImageElement[]; return images.length >= 4 && images.every((image) => image.complete && image.naturalWidth > 0) }, null, { timeout: 10_000 })
    await page.locator('.editing-clip').first().click()
    await page.locator('[data-testid="editing-treatment-control"]').waitFor({ timeout: 10_000 })
    await page.locator('[data-testid="editing-treatment-punch-in"]').click()
    await page.locator('[data-testid="editing-treatment-control"] input[type="range"]').fill('1.6')
    await page.locator('[data-testid="editing-treatment-anchor-left"]').click()
    await page.waitForFunction(() => { const video = document.querySelector('video.video-surface') as HTMLVideoElement | null; return video?.classList.contains('is-punch-in') === true && video.style.transform === 'scale(1.6)' && video.style.transformOrigin === '0% 50%' })
    await page.locator('[data-testid="editing-filter-control"] .editing-filter-summary').click()
    await page.locator('[data-testid="editing-filter-control"] input').first().fill('120')
    await page.waitForFunction(() => (document.querySelector('video.video-surface') as HTMLVideoElement | null)?.style.filter === 'brightness(1.2) contrast(1) saturate(1)')
    const treatmentBeforeSplit = await page.evaluate(() => ({ treatment: (document.querySelector('video.video-surface') as HTMLVideoElement | null)?.style.transform ?? '', treatmentOrigin: (document.querySelector('video.video-surface') as HTMLVideoElement | null)?.style.transformOrigin ?? '' }))
    await page.locator('[data-testid="editing-track"]').evaluate((element) => { const rect = element.getBoundingClientRect(); element.dispatchEvent(new MouseEvent('click', { bubbles: true, clientX: rect.left + rect.width * 0.2, clientY: rect.top + rect.height / 2 })) })
    await page.waitForFunction(() => !(document.querySelector('[data-testid="editing-split"]') as HTMLButtonElement | null)?.disabled)
    await page.locator('[data-testid="editing-split"]').click()
    await page.waitForFunction(() => document.querySelectorAll('.editing-clip').length === 2)
    await page.locator('.editing-clip').nth(1).click()
    await page.locator('[data-testid="editing-track"]').evaluate((element) => { const rect = element.getBoundingClientRect(); element.dispatchEvent(new MouseEvent('click', { bubbles: true, clientX: rect.left + rect.width * 0.21, clientY: rect.top + rect.height / 2 })) })
    await page.locator('[data-testid="editing-transition-control"] .editing-transition-summary').click()
    await page.locator('[data-testid="editing-transition-wipe-left"]').click()
    await page.waitForFunction(() => { const video = document.querySelector('video.video-surface') as HTMLVideoElement | null; return video?.style.clipPath.includes('inset') === true })
    const transitionPreview = await page.evaluate(() => (document.querySelector('video.video-surface') as HTMLVideoElement | null)?.style.clipPath ?? '')
    await page.locator('[data-testid="editing-transition-control"] .editing-transition-summary').click()
    await page.locator('[data-testid="editing-graphic-control"] .editing-graphic-summary').click()
    await page.locator('[data-testid="editing-graphic-text"]').fill('烟测标题')
    await page.locator('[data-testid="editing-graphic-add"]').click()
    await page.waitForSelector('.editing-graphic-card')
    await page.locator('[data-testid="editing-graphic-edit-text"]').fill('烟测标题-修改')
    await page.locator('[data-testid="editing-graphic-save"]').click()
    await page.waitForFunction(() => document.querySelector('.editing-graphic-card')?.textContent === '烟测标题-修改')
    const graphicTrack = page.locator('[data-testid="editing-graphic-track"]')
    const graphicTrackBox = await graphicTrack.boundingBox()
    const graphicItem = page.locator('.editing-graphic-item-button').first()
    const graphicItemBox = await graphicItem.boundingBox()
    if (!graphicTrackBox || !graphicItemBox) throw new Error('Graphic track was not measurable')
    await page.mouse.move(graphicItemBox.x + graphicItemBox.width / 2, graphicItemBox.y + graphicItemBox.height / 2)
    await page.mouse.down()
    await page.mouse.move(graphicItemBox.x + graphicItemBox.width / 2 + graphicTrackBox.width * 0.04, graphicItemBox.y + graphicItemBox.height / 2)
    await page.mouse.up()
    await page.waitForFunction(() => Number.parseFloat((document.querySelector('.editing-graphic-item') as HTMLElement | null)?.style.left ?? '0') > 0)
    await page.waitForTimeout(20)
    await page.locator('[data-testid="editing-video-block-control"] .editing-video-block-summary').click()
    await page.locator('[data-testid="editing-video-block-position"]').selectOption('split-left')
    await page.locator('[data-testid="editing-video-block-add"]').click()
    await page.waitForSelector('.editing-video-block.is-split-left')
    await page.waitForFunction(() => document.querySelector('video.video-surface')?.classList.contains('is-split-left') === true)
    await page.locator('[data-testid="editing-video-block-edit-size"]').fill('60')
    await page.locator('[data-testid="editing-video-block-edit-radius"]').fill('18')
    await page.locator('[data-testid="editing-video-block-edit-border"]').fill('4')
    await page.locator('[data-testid="editing-video-block-edit-source-start"]').fill('10')
    await page.locator('[data-testid="editing-video-block-edit-enter"]').selectOption('slide-left')
    await page.locator('[data-testid="editing-video-block-edit-exit"]').selectOption('fade')
    await page.locator('[data-testid="editing-video-block-edit-motion-duration"]').fill('0.5')
    await page.waitForFunction(() => { const block = document.querySelector('.editing-video-block') as HTMLVideoElement | null; const surface = document.querySelector('video.video-surface') as HTMLVideoElement | null; return block?.style.width === '60%' && block.style.borderRadius === '18px' && block.style.borderWidth === '4px' && block.style.transform.includes('translateX') && surface?.style.width === '40%' })
    const videoBlockMotionPreview = await page.evaluate(() => { const block = document.querySelector('.editing-video-block') as HTMLVideoElement | null; return { transform: block?.style.transform ?? '', opacity: block?.style.opacity ?? '' } })
    const punchInOutputPath = join(smokeHomeDirectory, 'aivplayer-smoke-punch-in.mp4')
    const punchInExportResult = await page.evaluate(async ({ sourcePath, targetPath }) => window.aiv.exportMediaTimeline({ mediaPath: sourcePath, clips: [{ mediaPath: sourcePath, startSeconds: 0, endSeconds: 2, treatment: 'punch-in', treatmentScale: 1.6, treatmentAnchor: 'left', filter: { brightness: 1.2 } }], mode: 'video', outputVideoPath: targetPath }), { sourcePath: mediaPath, targetPath: punchInOutputPath })
    const punchInOutputStats = punchInExportResult.success ? await stat(punchInOutputPath).catch(() => null) : null
    const transitionOutputPath = join(smokeHomeDirectory, 'aivplayer-smoke-transition.mp4')
    const transitionExportResult = await page.evaluate(async ({ sourcePath, targetPath }) => window.aiv.exportMediaTimeline({ mediaPath: sourcePath, clips: [{ mediaPath: sourcePath, startSeconds: 0, endSeconds: 2 }, { mediaPath: sourcePath, startSeconds: 4, endSeconds: 6, transitionIn: { type: 'fade', durationSeconds: 0.4 } }], mode: 'video', outputVideoPath: targetPath }), { sourcePath: mediaPath, targetPath: transitionOutputPath })
    const transitionOutputStats = transitionExportResult.success ? await stat(transitionOutputPath).catch(() => null) : null
    const multiTransitionOutputPath = join(smokeHomeDirectory, 'aivplayer-smoke-multi-transition.mp4')
    const multiTransitionExportResult = await page.evaluate(async ({ sourcePath, targetPath }) => window.aiv.exportMediaTimeline({ mediaPath: sourcePath, clips: [{ mediaPath: sourcePath, startSeconds: 0, endSeconds: 2 }, { mediaPath: sourcePath, startSeconds: 4, endSeconds: 6, transitionIn: { type: 'wipe-left', durationSeconds: 0.4 } }, { mediaPath: sourcePath, startSeconds: 8, endSeconds: 10, transitionIn: { type: 'zoom', durationSeconds: 0.4 } }], mode: 'video', outputVideoPath: targetPath }), { sourcePath: mediaPath, targetPath: multiTransitionOutputPath })
    const multiTransitionOutputStats = multiTransitionExportResult.success ? await stat(multiTransitionOutputPath).catch(() => null) : null
    const graphicOutputPath = join(smokeHomeDirectory, 'aivplayer-smoke-graphic.mp4')
    const graphicExportResult = await page.evaluate(async ({ sourcePath, targetPath }) => window.aiv.exportMediaTimeline({ mediaPath: sourcePath, clips: [{ mediaPath: sourcePath, startSeconds: 0, endSeconds: 2 }], graphics: [{ id: 'smoke-graphic', startSeconds: 0, durationSeconds: 1.5, text: '烟测标题', position: 'center', style: 'title' }], mode: 'video', outputVideoPath: targetPath }), { sourcePath: mediaPath, targetPath: graphicOutputPath })
    const graphicOutputStats = graphicExportResult.success ? await stat(graphicOutputPath).catch(() => null) : null
    const videoBlockOutputPath = join(smokeHomeDirectory, 'aivplayer-smoke-video-block.mp4')
    const videoBlockExportResult = await page.evaluate(async ({ sourcePath, targetPath }) => window.aiv.exportMediaTimeline({ mediaPath: sourcePath, clips: [{ mediaPath: sourcePath, startSeconds: 0, endSeconds: 4 }], videoBlocks: [{ mediaPath: sourcePath, sourceStartSeconds: 8, sourceEndSeconds: 10.5, startSeconds: 1, durationSeconds: 2.5, position: 'bottom-right', sizePercent: 40, borderRadius: 18, borderWidth: 4, enterMotion: 'scale', exitMotion: 'fade', motionDurationSeconds: 0.5 }], mode: 'video', outputVideoPath: targetPath }), { sourcePath: mediaPath, targetPath: videoBlockOutputPath })
    const videoBlockOutputStats = videoBlockExportResult.success ? await stat(videoBlockOutputPath).catch(() => null) : null
    const splitOutputPath = join(smokeHomeDirectory, 'aivplayer-smoke-split.mp4')
    const splitExportResult = await page.evaluate(async ({ sourcePath, targetPath }) => window.aiv.exportMediaTimeline({ mediaPath: sourcePath, clips: [{ mediaPath: sourcePath, startSeconds: 0, endSeconds: 4 }], videoBlocks: [{ mediaPath: sourcePath, sourceStartSeconds: 8, sourceEndSeconds: 11, startSeconds: 1, durationSeconds: 3, position: 'split-left' }], mode: 'video', outputVideoPath: targetPath }), { sourcePath: mediaPath, targetPath: splitOutputPath })
    const splitOutputStats = splitExportResult.success ? await stat(splitOutputPath).catch(() => null) : null
    const treatmentScreenshotPath = join(smokeHomeDirectory, 'aivplayer-smoke-editing-treatment.png')
    await page.screenshot({ path: treatmentScreenshotPath, fullPage: false })
    const before = await page.evaluate(() => ({
      rows: document.querySelectorAll('[data-testid="editing-script-list"] .editing-script-row').length,
      deleted: document.querySelectorAll('[data-testid="editing-script-list"] .editing-script-row.is-deleted').length,
      time: document.querySelector('.editing-time-readout')?.textContent ?? '',
      treatment: (document.querySelector('video.video-surface') as HTMLVideoElement | null)?.style.transform ?? '',
      treatmentOrigin: (document.querySelector('video.video-surface') as HTMLVideoElement | null)?.style.transformOrigin ?? '',
      filter: (document.querySelector('video.video-surface') as HTMLVideoElement | null)?.style.filter ?? '',
      graphic: (document.querySelector('[data-testid="editing-graphic-edit-text"]') as HTMLInputElement | null)?.value ?? '',
      graphicLeft: (document.querySelector('.editing-graphic-item') as HTMLElement | null)?.style.left ?? '',
      splitSurface: document.querySelector('video.video-surface')?.className ?? '',
      splitBlock: document.querySelector('.editing-video-block')?.className ?? '',
      blockStyle: (() => { const block = document.querySelector('.editing-video-block') as HTMLVideoElement | null; return { width: block?.style.width ?? '', radius: block?.style.borderRadius ?? '', border: block?.style.borderWidth ?? '', transform: block?.style.transform ?? '', opacity: block?.style.opacity ?? '' } })()
    }))
    await page.locator('[data-testid="editing-video-block-editor"] .editing-video-block-summary').click()

    await page.locator('[data-testid="editing-script-list"] .editing-script-action.is-danger').first().click()
    await page.waitForFunction(() => document.querySelectorAll('[data-testid="editing-script-list"] .editing-script-row.is-deleted').length === 1)
    const afterDelete = await page.evaluate(() => ({
      deleted: document.querySelectorAll('[data-testid="editing-script-list"] .editing-script-row.is-deleted').length,
      time: document.querySelector('.editing-time-readout')?.textContent ?? '',
      count: document.querySelector('[data-testid="editing-script-panel"] .editing-script-title span')?.textContent ?? ''
    }))

    await page.locator('[data-testid="editing-script-list"] .editing-script-row.is-deleted .editing-script-action').click()
    await page.waitForFunction(() => document.querySelectorAll('[data-testid="editing-script-list"] .editing-script-row.is-deleted').length === 0)
    const afterRestore = await page.evaluate(() => ({
      deleted: document.querySelectorAll('[data-testid="editing-script-list"] .editing-script-row.is-deleted').length,
      time: document.querySelector('.editing-time-readout')?.textContent ?? ''
    }))

    await page.locator('[data-testid="editing-undo"]').click()
    await page.waitForFunction(() => document.querySelectorAll('[data-testid="editing-script-list"] .editing-script-row.is-deleted').length === 1)
    await page.locator('[data-testid="editing-redo"]').click()
    await page.waitForFunction(() => document.querySelectorAll('[data-testid="editing-script-list"] .editing-script-row.is-deleted').length === 0)
    const screenshotPath = join(smokeHomeDirectory, 'aivplayer-smoke-editing-script.png')
    await page.screenshot({ path: screenshotPath, fullPage: false })

    console.log('AIVPlayer Smoke Editing Script')
    console.log(`Media: ${mediaPath}`)
    console.log(`Before: ${JSON.stringify(before)}`)
    console.log(`Video block motion preview: ${JSON.stringify(videoBlockMotionPreview)}`)
    console.log(`After delete: ${JSON.stringify(afterDelete)}`)
    console.log(`After restore: ${JSON.stringify(afterRestore)}`)
    console.log(`Punch-in export: ${JSON.stringify({ success: punchInExportResult.success, message: punchInExportResult.message, outputBytes: punchInOutputStats?.size ?? 0 })}`)
    console.log(`Transition export: ${JSON.stringify({ success: transitionExportResult.success, message: transitionExportResult.message, outputBytes: transitionOutputStats?.size ?? 0 })}`)
    console.log(`Multi-transition export: ${JSON.stringify({ success: multiTransitionExportResult.success, message: multiTransitionExportResult.message, outputBytes: multiTransitionOutputStats?.size ?? 0 })}`)
    console.log(`Graphic export: ${JSON.stringify({ success: graphicExportResult.success, message: graphicExportResult.message, outputBytes: graphicOutputStats?.size ?? 0 })}`)
    console.log(`Video block export: ${JSON.stringify({ success: videoBlockExportResult.success, message: videoBlockExportResult.message, outputBytes: videoBlockOutputStats?.size ?? 0 })}`)
    console.log(`Split export: ${JSON.stringify({ success: splitExportResult.success, message: splitExportResult.message, outputBytes: splitOutputStats?.size ?? 0 })}`)
    console.log(`Treatment screenshot: ${treatmentScreenshotPath}`)
    console.log(`Console errors: ${JSON.stringify(consoleErrors)}`)
    console.log(`Screenshot: ${screenshotPath}`)

    if (before.rows !== 3 || before.deleted !== 0 || treatmentBeforeSplit.treatment !== 'scale(1.6)' || treatmentBeforeSplit.treatmentOrigin !== '0% 50%' || !transitionPreview.includes('inset') || before.filter !== 'brightness(1.2) contrast(1) saturate(1)' || before.graphic !== '烟测标题-修改' || before.graphicLeft === '0%' || !before.splitSurface.includes('is-split-left') || !before.splitBlock.includes('is-split-left') || before.blockStyle.width !== '60%' || before.blockStyle.radius !== '18px' || before.blockStyle.border !== '4px' || !videoBlockMotionPreview.transform.includes('translateX') || afterDelete.deleted !== 1 || afterRestore.deleted !== 0 || !punchInExportResult.success || !punchInOutputStats || punchInOutputStats.size <= 0 || !transitionExportResult.success || !transitionOutputStats || transitionOutputStats.size <= 0 || !multiTransitionExportResult.success || !multiTransitionOutputStats || multiTransitionOutputStats.size <= 0 || !graphicExportResult.success || !graphicOutputStats || graphicOutputStats.size <= 0 || !videoBlockOutputStats || !videoBlockExportResult.success || !splitExportResult.success || !splitOutputStats || splitOutputStats.size <= 0 || consoleErrors.length > 0) process.exitCode = 1
  } finally {
    await app.close()
  }
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
