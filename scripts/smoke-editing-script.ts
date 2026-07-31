import { _electron as electron } from 'playwright'
import { execFile } from 'node:child_process'
import { copyFile, mkdtemp, stat, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { promisify } from 'node:util'

const execFileAsync = promisify(execFile)

const sourceMediaPath = process.argv[2] ?? '/Users/ponponon/Music/aivplayer_test_video_1min.mp4'

async function main(): Promise<void> {
  const ffmpegFilterOutput = await execFileAsync('ffmpeg', ['-hide_banner', '-filters'], { maxBuffer: 4 * 1024 * 1024 }).then(({ stdout, stderr }) => `${stdout}\n${stderr}`).catch(() => '')
  const hasSubtitleFilter = /\bsubtitles\b/u.test(ffmpegFilterOutput)
  const smokeDirectory = await mkdtemp(join(tmpdir(), 'aivplayer-smoke-editing-script-'))
  const mediaPath = join(smokeDirectory, 'script-smoke.mp4')
  const secondMediaPath = join(smokeDirectory, 'second-source.mp4')
  const shortMediaPath = join(smokeDirectory, 'short-source.mp4')
  await copyFile(sourceMediaPath, mediaPath)
  await copyFile(sourceMediaPath, secondMediaPath)
  await execFileAsync('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', '-i', mediaPath, '-t', '1.5', '-c:v', 'libx264', '-preset', 'ultrafast', '-c:a', 'aac', shortMediaPath])
  await writeFile(join(smokeDirectory, 'script-smoke.srt'), [
    '1',
    '00:00:00,000 --> 00:00:02,000',
    '第一句脚本这是一个用于验证播放器自动分行、逐词高亮以及长字幕导出一致性的测试句子，应该被拆分成多个连续显示页面。',
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
    args: ['--no-sandbox', '--in-process-gpu', `--user-data-dir=${smokeHomeDirectory}`, 'out/main/index.js', mediaPath],
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
    const scriptEditButton = page.locator('[data-testid^="editing-script-edit-"]').first()
    const scriptEditTestId = await scriptEditButton.getAttribute('data-testid')
    if (!scriptEditTestId) throw new Error('Script edit button was not identified')
    const scriptEditSegmentId = scriptEditTestId.replace('editing-script-edit-', '')
    const scriptTextBeforeEdit = await page.locator('.editing-script-text').first().textContent()
    if (!scriptTextBeforeEdit) throw new Error('Script text was not rendered')
    const scriptTextAfterEdit = `${scriptTextBeforeEdit}-已编辑`
    await scriptEditButton.click()
    await page.locator(`[data-testid="editing-script-input-${scriptEditSegmentId}"]`).fill(scriptTextAfterEdit)
    await page.locator(`[data-testid="editing-script-save-${scriptEditSegmentId}"]`).click()
    await page.waitForFunction((expected) => document.querySelector('.editing-script-text')?.textContent === expected, scriptTextAfterEdit)
    await page.waitForFunction((expected) => {
      const stored = JSON.parse(localStorage.getItem('aivplayer.editing-projects.v1') ?? '{}') as Record<string, { scriptSegments?: Array<{ text: string }>; captions?: Array<{ kind?: string; text?: string }> }>
      return Object.values(stored).some((project) => project.scriptSegments?.some((segment) => segment.text === expected) === true && project.captions?.some((caption) => caption.kind === 'source' && caption.text === expected) === true)
    }, scriptTextAfterEdit)
    const persistedScriptEdit = true
    await page.locator('[data-testid="editing-undo"]').click()
    await page.waitForFunction((expected) => document.querySelector('.editing-script-text')?.textContent === expected, scriptTextBeforeEdit)
    await page.locator('[data-testid="editing-redo"]').click()
    await page.waitForFunction((expected) => document.querySelector('.editing-script-text')?.textContent === expected, scriptTextAfterEdit)
    await page.locator('[data-testid="editing-theme-control"] .editing-theme-summary').click()
    await page.locator('[data-testid="editing-theme-warm"]').click()
    await page.locator('[data-testid="editing-theme-name"]').fill('烟测主题')
    await page.locator('[data-testid="editing-theme-save"]').click()
    await page.waitForSelector('[data-testid^="editing-theme-saved-"]')
    await page.locator('[data-testid="editing-theme-search"]').fill('烟测主题')
    const savedThemeCount = await page.locator('[data-testid^="editing-theme-saved-"]').count()
    await page.locator('[data-testid^="editing-theme-saved-"]').click()
    const themePreview = await page.evaluate(() => ({ warmActive: document.querySelector('[data-testid="editing-theme-warm"]')?.classList.contains('is-active') === true, frameClass: document.querySelector('.stage')?.classList.contains('editing-frame-warm') === true, graphicVariant: document.querySelector('.editing-graphic-layer')?.classList.contains('is-frame-sticker') === true, captionEffectActive: document.querySelector('[data-testid="editing-caption-effect-word-pop"]')?.classList.contains('is-active') === true, savedThemeCount: document.querySelectorAll('[data-testid^="editing-theme-saved-"]').length }))
    await page.locator('[data-testid="editing-theme-control"] .editing-theme-summary').click()
    await page.locator('[data-testid="editing-canvas-control"] .editing-canvas-summary').click()
    await page.locator('[data-testid="editing-canvas-portrait"]').click()
    await page.waitForFunction(() => document.querySelector('.stage')?.getAttribute('data-editing-canvas') === 'portrait' && document.querySelector('[data-testid="editing-safe-area-overlay"]') !== null)
    const canvasPreview = await page.evaluate(() => ({
      preset: document.querySelector('.stage')?.getAttribute('data-editing-canvas') ?? '',
      safeArea: document.querySelector('[data-testid="editing-safe-area-overlay"]') !== null,
      objectFit: getComputedStyle(document.querySelector('video.video-surface') as HTMLVideoElement).objectFit,
      summary: document.querySelector('.editing-export-summary')?.textContent ?? ''
    }))
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
    const transitionPreviewCardCount = await page.locator('[data-testid="editing-transition-control"] .editing-transition-preview').count()
    await page.locator('[data-testid="editing-transition-circleopen"] .editing-transition-preview-circleopen').waitFor()
    await page.locator('[data-testid="editing-transition-crosszoom"] .editing-transition-preview-crosszoom').waitFor()
    await page.locator('[data-testid="editing-transition-wipe-left"]').click()
    await page.waitForFunction(() => { const video = document.querySelector('video.video-surface') as HTMLVideoElement | null; return video?.style.clipPath.includes('inset') === true })
    const transitionPreview = await page.evaluate(() => (document.querySelector('video.video-surface') as HTMLVideoElement | null)?.style.clipPath ?? '')
    await page.locator('[data-testid="editing-transition-circleopen"]').click()
    await page.waitForFunction(() => { const video = document.querySelector('video.video-surface') as HTMLVideoElement | null; return video?.style.clipPath.includes('circle') === true })
    const circleTransitionPreview = await page.evaluate(() => (document.querySelector('video.video-surface') as HTMLVideoElement | null)?.style.clipPath ?? '')
    await page.locator('[data-testid="editing-transition-wipe-left"]').click()
    await page.locator('[data-testid="editing-transition-control"] .editing-transition-summary').click()
    await page.locator('[data-testid="editing-graphic-control"] .editing-graphic-summary').click()
    await page.locator('[data-testid="editing-graphic-preset-quote"]').click()
    await page.waitForFunction(() => document.querySelectorAll('.editing-graphic-card').length === 1)
    const reusableGraphicPreset = await page.locator('.editing-graphic-card').first().textContent()
    await page.locator('[data-testid="editing-graphic-control"] .editing-graphic-summary').click()
    await page.locator('[data-testid="editing-graphic-text"]').fill('烟测标题')
    await page.locator('[data-testid="editing-graphic-add"]').click()
    await page.waitForSelector('.editing-graphic-card')
    await page.locator('[data-testid="editing-graphic-edit-text"]').fill('烟测标题-修改')
    await page.locator('[data-testid="editing-graphic-save"]').click()
    await page.waitForFunction(() => Array.from(document.querySelectorAll('.editing-graphic-card')).some((card) => card.textContent === '烟测标题-修改'))
    const graphicTextPreview = await page.locator('[data-testid="editing-graphic-edit-text"]').inputValue()
    await page.locator('[data-testid="editing-graphic-save-asset"]').click()
    await page.locator('[data-testid="editing-graphic-control"] .editing-graphic-summary').click()
    await page.locator('[data-testid="editing-graphic-assets-search"]').fill('烟测标题-修改')
    await page.locator('.editing-graphic-asset').filter({ hasText: '烟测标题-修改' }).click()
    await page.waitForFunction(() => document.querySelectorAll('.editing-graphic-card').length === 3)
    const reusableGraphicAsset = await page.locator('.editing-graphic-asset').count()
    const graphicTrack = page.locator('[data-testid="editing-graphic-track"]')
    const graphicTrackBox = await graphicTrack.boundingBox()
    const graphicItem = page.locator('.editing-graphic-item').last().locator('.editing-graphic-item-button')
    const graphicItemBox = await graphicItem.boundingBox()
    if (!graphicTrackBox || !graphicItemBox) throw new Error('Graphic track was not measurable')
    const graphicMoveBefore = await graphicItem.evaluate((element) => (element.parentElement as HTMLElement).style.left)
    await page.mouse.move(graphicItemBox.x + graphicItemBox.width / 2, graphicItemBox.y + graphicItemBox.height / 2)
    await page.mouse.down()
    await page.mouse.move(graphicItemBox.x + graphicItemBox.width / 2 + graphicTrackBox.width * 0.04, graphicItemBox.y + graphicItemBox.height / 2)
    await page.mouse.up()
    await page.waitForFunction((before) => Number.parseFloat((document.querySelectorAll('.editing-graphic-item')[document.querySelectorAll('.editing-graphic-item').length - 1] as HTMLElement | undefined)?.style.left ?? '0') > Number.parseFloat(before), graphicMoveBefore)
    await page.waitForTimeout(20)
    const graphicTrimItem = page.locator('.editing-graphic-item').last()
    const graphicTrimBefore = await graphicTrimItem.evaluate((element) => (element as HTMLElement).style.width)
    const graphicTrimHandle = graphicTrimItem.locator('[data-editing-trim-edge="end"]')
    const graphicTrimHandleBox = await graphicTrimHandle.boundingBox()
    const graphicTrimItemBox = await graphicTrimItem.boundingBox()
    if (!graphicTrimHandleBox || !graphicTrimItemBox) throw new Error('Graphic trim handle was not measurable')
    await page.mouse.move(graphicTrimHandleBox.x + graphicTrimHandleBox.width / 2, graphicTrimHandleBox.y + graphicTrimHandleBox.height / 2)
    await page.mouse.down()
    await page.mouse.move(graphicTrimHandleBox.x - graphicTrimItemBox.width * 0.25, graphicTrimHandleBox.y + graphicTrimHandleBox.height / 2)
    await page.mouse.up()
    await page.waitForFunction((before) => Number.parseFloat((document.querySelectorAll('.editing-graphic-item')[document.querySelectorAll('.editing-graphic-item').length - 1] as HTMLElement | undefined)?.style.width ?? '0') < Number.parseFloat(before), graphicTrimBefore)
    const graphicTrimAfter = await graphicTrimItem.evaluate((element) => (element as HTMLElement).style.width)
    const graphicEditorAfterTrim = page.locator('[data-testid="editing-graphic-editor"] .editing-graphic-summary')
    if (await graphicEditorAfterTrim.count() > 0 && await page.locator('[data-testid="editing-graphic-editor"]').getAttribute('open') !== null) {
      await graphicEditorAfterTrim.click({ force: true })
      await page.waitForFunction(() => !document.querySelector('[data-testid="editing-graphic-editor"]')?.hasAttribute('open'))
    }
    await page.locator('[data-testid="editing-undo"]').click()
    await page.waitForFunction((before) => (document.querySelectorAll('.editing-graphic-item')[document.querySelectorAll('.editing-graphic-item').length - 1] as HTMLElement | undefined)?.style.width === before, graphicTrimBefore)
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
    const splitPreview = await page.evaluate(() => {
      const block = document.querySelector('.editing-video-block') as HTMLElement | null
      const surface = document.querySelector('video.video-surface') as HTMLElement | null
      return { surface: surface?.className ?? '', block: block?.className ?? '', width: block?.style.width ?? '', radius: block?.style.borderRadius ?? '', border: block?.style.borderWidth ?? '' }
    })
    await page.locator('.editing-caption-item-button').first().click()
    await page.locator('.editing-graphic-item-button').last().click({ modifiers: ['Meta'] })
    await page.locator('.editing-video-block-item-button').first().click({ modifiers: ['Meta'] })
    await page.waitForFunction(() => document.querySelector('[data-testid="editing-selection-count"]')?.textContent === '3 selected' || document.querySelector('[data-testid="editing-selection-count"]')?.textContent === '已选择 3 项')
    const multiOverlaySelectionCount = await page.locator('[data-testid="editing-selection-count"]').textContent()
    const selectionToolbarScreenshotPath = join(smokeHomeDirectory, 'aivplayer-smoke-editing-selection-toolbar.png')
    await page.screenshot({ path: selectionToolbarScreenshotPath, fullPage: false })
    const graphicBeforeGroupMove = await page.locator('.editing-graphic-item.is-selected').evaluate((element) => (element as HTMLElement).style.left)
    await page.locator('[data-testid="editing-selection-move-right"]').click()
    await page.waitForFunction((before) => Number.parseFloat((document.querySelector('.editing-graphic-item.is-selected') as HTMLElement | null)?.style.left ?? '0') > Number.parseFloat(before), graphicBeforeGroupMove)
    const graphicAfterGroupMove = await page.locator('.editing-graphic-item.is-selected').evaluate((element) => (element as HTMLElement).style.left)
    const videoBlockEditorAfterGroupMove = page.locator('[data-testid="editing-video-block-editor"] .editing-video-block-summary')
    if (await videoBlockEditorAfterGroupMove.count() > 0 && await page.locator('[data-testid="editing-video-block-editor"]').getAttribute('open') !== null) {
      await videoBlockEditorAfterGroupMove.click({ force: true })
      await page.waitForFunction(() => !document.querySelector('[data-testid="editing-video-block-editor"]')?.hasAttribute('open'))
    }
    await page.locator('[data-testid="editing-undo"]').click()
    await page.waitForFunction((before) => (document.querySelector('.editing-graphic-item.is-selected') as HTMLElement | null)?.style.left === before, graphicBeforeGroupMove)
    const overlayCountsBeforeDuplicate = await page.evaluate(() => ({ captions: document.querySelectorAll('.editing-caption-item').length, graphics: document.querySelectorAll('.editing-graphic-item').length, videoBlocks: document.querySelectorAll('.editing-video-block-item').length }))
    await page.locator('[data-testid="editing-duplicate-selection"]').click()
    await page.waitForFunction((before) => document.querySelectorAll('.editing-caption-item').length > before.captions && document.querySelectorAll('.editing-graphic-item').length > before.graphics && document.querySelectorAll('.editing-video-block-item').length > before.videoBlocks, overlayCountsBeforeDuplicate)
    const duplicateSelectionCount = await page.locator('[data-testid="editing-selection-count"]').textContent()
    const overlayCountsAfterDuplicate = await page.evaluate(() => ({ captions: document.querySelectorAll('.editing-caption-item').length, graphics: document.querySelectorAll('.editing-graphic-item').length, videoBlocks: document.querySelectorAll('.editing-video-block-item').length }))
    await page.locator('[data-testid="editing-undo"]').click()
    await page.waitForFunction((before) => document.querySelectorAll('.editing-caption-item').length === before.captions && document.querySelectorAll('.editing-graphic-item').length === before.graphics && document.querySelectorAll('.editing-video-block-item').length === before.videoBlocks, overlayCountsBeforeDuplicate)
    await page.locator('.editing-graphic-item-button').last().click()
    const graphicCountBeforeShortcutDuplicate = await page.locator('.editing-graphic-item').count()
    await page.locator('.editing-graphic-item-button').last().focus()
    await page.keyboard.press('Meta+d')
    await page.waitForFunction((before) => document.querySelectorAll('.editing-graphic-item').length > before, graphicCountBeforeShortcutDuplicate)
    const graphicCountAfterShortcutDuplicate = await page.locator('.editing-graphic-item').count()
    await page.locator('[data-testid="editing-undo"]').click()
    await page.waitForFunction((before) => document.querySelectorAll('.editing-graphic-item').length === before, graphicCountBeforeShortcutDuplicate)
    await page.locator('.editing-graphic-item-button').last().click()
    const graphicBeforeShiftNudge = await page.locator('.editing-graphic-item.is-selected').evaluate((element) => (element as HTMLElement).style.left)
    await page.locator('.editing-graphic-item.is-selected .editing-graphic-item-button').focus()
    await page.keyboard.press('Shift+ArrowRight')
    await page.waitForFunction((before) => Number.parseFloat((document.querySelector('.editing-graphic-item.is-selected') as HTMLElement | null)?.style.left ?? '0') - Number.parseFloat(before) > 1, graphicBeforeShiftNudge)
    const graphicAfterShiftNudge = await page.locator('.editing-graphic-item.is-selected').evaluate((element) => (element as HTMLElement).style.left)
    await page.locator('[data-testid="editing-undo"]').click()
    await page.waitForFunction((before) => (document.querySelector('.editing-graphic-item.is-selected') as HTMLElement | null)?.style.left === before, graphicBeforeShiftNudge)
    const graphicCanvasOverlay = page.locator('[data-testid="editing-graphic-canvas-overlay"]')
    await graphicCanvasOverlay.waitFor({ timeout: 10_000 })
    const graphicCanvasBox = page.locator('.editing-graphic-canvas-box')
    const graphicCanvasInitialStyle = await graphicCanvasBox.getAttribute('style')
    const graphicCanvasBodyBox = await page.locator('.editing-graphic-canvas-body').boundingBox()
    if (!graphicCanvasBodyBox || !graphicCanvasInitialStyle) throw new Error('Graphic canvas body was not measurable')
    await page.mouse.move(graphicCanvasBodyBox.x + graphicCanvasBodyBox.width / 2, graphicCanvasBodyBox.y + graphicCanvasBodyBox.height / 2)
    await page.mouse.down()
    await page.mouse.move(graphicCanvasBodyBox.x + graphicCanvasBodyBox.width / 2 + 24, graphicCanvasBodyBox.y + graphicCanvasBodyBox.height / 2 + 12, { steps: 5 })
    await page.mouse.up()
    await page.waitForFunction((before) => document.querySelector('.editing-graphic-canvas-box')?.getAttribute('style') !== before, graphicCanvasInitialStyle, { timeout: 10_000 })
    const graphicCanvasMovedStyle = await graphicCanvasBox.getAttribute('style')
    await page.locator('[data-testid="editing-undo"]').click()
    await page.waitForFunction((before) => document.querySelector('.editing-graphic-canvas-box')?.getAttribute('style') === before, graphicCanvasInitialStyle, { timeout: 10_000 })
    const graphicCanvasRestoredAfterMove = await graphicCanvasBox.getAttribute('style')
    const graphicCanvasRightHandleBox = await page.locator('.editing-graphic-canvas-handle.is-right').boundingBox()
    if (!graphicCanvasRightHandleBox) throw new Error('Graphic canvas right handle was not measurable')
    await page.mouse.move(graphicCanvasRightHandleBox.x + graphicCanvasRightHandleBox.width / 2, graphicCanvasRightHandleBox.y + graphicCanvasRightHandleBox.height / 2)
    await page.mouse.down()
    await page.mouse.move(graphicCanvasRightHandleBox.x + graphicCanvasRightHandleBox.width / 2 + 24, graphicCanvasRightHandleBox.y + graphicCanvasRightHandleBox.height / 2, { steps: 5 })
    await page.mouse.up()
    await page.waitForFunction((before) => document.querySelector('.editing-graphic-canvas-box')?.getAttribute('style') !== before, graphicCanvasInitialStyle, { timeout: 10_000 })
    const graphicCanvasResizedStyle = await graphicCanvasBox.getAttribute('style')
    await page.locator('[data-testid="editing-undo"]').click()
    await page.waitForFunction((before) => document.querySelector('.editing-graphic-canvas-box')?.getAttribute('style') === before, graphicCanvasInitialStyle, { timeout: 10_000 })
    const graphicCanvasRestoredAfterResize = await graphicCanvasBox.getAttribute('style')
    const graphicCanvasRotateBox = await page.locator('.editing-graphic-canvas-rotate').boundingBox()
    if (!graphicCanvasRotateBox) throw new Error('Graphic canvas rotate handle was not measurable')
    await page.mouse.move(graphicCanvasRotateBox.x + graphicCanvasRotateBox.width / 2, graphicCanvasRotateBox.y + graphicCanvasRotateBox.height / 2)
    await page.mouse.down()
    await page.mouse.move(graphicCanvasRotateBox.x + graphicCanvasRotateBox.width / 2 + 30, graphicCanvasRotateBox.y + graphicCanvasRotateBox.height / 2 - 18, { steps: 5 })
    await page.mouse.up()
    await page.waitForFunction((before) => document.querySelector('.editing-graphic-canvas-box')?.getAttribute('style') !== before, graphicCanvasInitialStyle, { timeout: 10_000 })
    const graphicCanvasRotatedStyle = await graphicCanvasBox.getAttribute('style')
    await page.locator('[data-testid="editing-undo"]').click()
    await page.waitForFunction((before) => document.querySelector('.editing-graphic-canvas-box')?.getAttribute('style') === before, graphicCanvasInitialStyle, { timeout: 10_000 })
    const graphicCanvasRestoredAfterRotate = await graphicCanvasBox.getAttribute('style')
    const graphicCanvasScreenshotPath = join(smokeHomeDirectory, 'aivplayer-smoke-editing-graphic-canvas.png')
    await page.screenshot({ path: graphicCanvasScreenshotPath, fullPage: false })
    const overlayTrackOrderBefore = await page.locator('[data-editing-overlay-track]').evaluateAll((elements) => elements.map((element) => element.getAttribute('data-editing-overlay-track')))
    const captionsTrackHandle = page.locator('[data-editing-overlay-track="captions"] .editing-track-reorder-handle')
    await captionsTrackHandle.dragTo(page.locator('[data-editing-overlay-track="videoBlocks"]'))
    await page.waitForFunction(() => document.querySelector('[data-editing-overlay-track]')?.getAttribute('data-editing-overlay-track') === 'captions')
    const overlayTrackOrderAfter = await page.locator('[data-editing-overlay-track]').evaluateAll((elements) => elements.map((element) => element.getAttribute('data-editing-overlay-track')))
    const overlayLayerPreview = await page.evaluate(() => ({ video: (document.querySelector('.editing-video-block-layer') as HTMLElement | null)?.style.zIndex ?? '', graphic: (document.querySelector('.editing-graphic-layer') as HTMLElement | null)?.style.zIndex ?? '', caption: (document.querySelector('.subtitle-overlay.is-editing-caption') as HTMLElement | null)?.style.zIndex ?? '' }))
    const overlayTrackOrderScreenshotPath = join(smokeHomeDirectory, 'aivplayer-smoke-editing-overlay-track-order.png')
    await page.screenshot({ path: overlayTrackOrderScreenshotPath, fullPage: false })
    await page.locator('[data-testid="editing-undo"]').click()
    await page.waitForFunction((before) => JSON.stringify(Array.from(document.querySelectorAll('[data-editing-overlay-track]')).map((element) => element.getAttribute('data-editing-overlay-track'))) === JSON.stringify(before), overlayTrackOrderBefore)
    await page.locator('.editing-clip').first().click()
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
    const graphicOutputResult = await page.evaluate(async ({ sourcePath, targetPath }) => window.aiv.exportMediaTimeline({ mediaPath: sourcePath, clips: [{ mediaPath: sourcePath, startSeconds: 0, endSeconds: 2 }], graphics: [{ id: 'smoke-graphic', startSeconds: 0, durationSeconds: 1.5, text: '烟测标题', position: 'center', style: 'title' }], frameId: 'warm', mode: 'video', outputVideoPath: targetPath }), { sourcePath: mediaPath, targetPath: graphicOutputPath })
    const graphicOutputStats = graphicOutputResult.success ? await stat(graphicOutputPath).catch(() => null) : null
    const captionEffectOutputPath = join(smokeHomeDirectory, 'aivplayer-smoke-caption-effect.mp4')
    const captionEffectExportResult = hasSubtitleFilter
      ? await page.evaluate(async ({ sourcePath, targetPath }) => window.aiv.exportMediaTimeline({ mediaPath: sourcePath, clips: [{ mediaPath: sourcePath, startSeconds: 0, endSeconds: 2 }], mode: 'burn-subtitle', subtitleText: '1\n00:00:00,000 --> 00:00:01,500\n第一句烟测字幕\n', subtitleRender: { presetId: 'yellow', emphasisMode: 'words', effect: 'kinetic-slam' }, outputVideoPath: targetPath }), { sourcePath: mediaPath, targetPath: captionEffectOutputPath })
      : { success: false, canceled: false, message: '跳过：本机 FFmpeg 未提供 subtitles/libass 滤镜' }
    const captionEffectOutputStats = captionEffectExportResult.success ? await stat(captionEffectOutputPath).catch(() => null) : null
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
    const videoBlockEditorSummary = page.locator('[data-testid="editing-video-block-editor"] .editing-video-block-summary')
    const videoBlockEditor = page.locator('[data-testid="editing-video-block-editor"]')
    if (await videoBlockEditorSummary.count() > 0 && await videoBlockEditor.getAttribute('open') !== null) {
      await videoBlockEditorSummary.click({ force: true })
      await page.waitForFunction(() => !document.querySelector('[data-testid="editing-video-block-editor"]')?.hasAttribute('open'))
    }
    const filterSummary = page.locator('[data-testid="editing-filter-control"] .editing-filter-summary')
    const filterControl = page.locator('[data-testid="editing-filter-control"]')
    if (await filterSummary.count() > 0 && await filterControl.getAttribute('open') !== null) {
      await filterSummary.click({ force: true })
      await page.waitForFunction(() => !document.querySelector('[data-testid="editing-filter-control"]')?.hasAttribute('open'))
    }
    const graphicEditorSummary = page.locator('[data-testid="editing-graphic-editor"] .editing-graphic-summary')
    const graphicEditor = page.locator('[data-testid="editing-graphic-editor"]')
    if (await graphicEditorSummary.count() > 0 && await graphicEditor.getAttribute('open') !== null) {
      await graphicEditorSummary.click({ force: true })
      await page.waitForFunction(() => !document.querySelector('[data-testid="editing-graphic-editor"]')?.hasAttribute('open'))
    }

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
    await page.locator('.editing-clip').nth(1).click()
    const graphicEditorAfterClip = page.locator('[data-testid="editing-graphic-editor"] .editing-graphic-summary')
    if (await graphicEditorAfterClip.count() > 0) {
      await graphicEditorAfterClip.click({ force: true })
      await page.waitForFunction(() => !document.querySelector('[data-testid="editing-graphic-editor"]')?.hasAttribute('open'))
    }
    const sceneClipCountBefore = await page.locator('.editing-clip').count()
    await page.locator('[data-testid="editing-scene-split"]').click()
    await page.waitForFunction((before) => document.querySelectorAll('.editing-clip').length > before, sceneClipCountBefore, { timeout: 20_000 })
    const sceneClipCountAfter = await page.locator('.editing-clip').count()
    await page.locator('.editing-clip').first().click()
    await page.locator('.editing-clip').nth(1).click({ modifiers: ['Meta'] })
    await page.waitForFunction(() => document.querySelector('[data-testid="editing-selection-count"]')?.textContent === '2 selected' || document.querySelector('[data-testid="editing-selection-count"]')?.textContent === '已选择 2 项')
    const multiSelectionCount = await page.locator('[data-testid="editing-selection-count"]').textContent()
    await page.keyboard.press('Delete')
    await page.waitForFunction((before) => document.querySelectorAll('.editing-clip').length < before, sceneClipCountAfter)
    const multiSelectionDeletedClipCount = await page.locator('.editing-clip').count()
    await page.locator('[data-testid="editing-undo"]').click()
    await page.waitForFunction((before) => document.querySelectorAll('.editing-clip').length === before, sceneClipCountAfter)
    await page.locator('[data-testid="editing-remove-silence"]').click()
    await page.waitForFunction(() => document.querySelector('.editing-project-status')?.textContent?.includes('已删除') === true, null, { timeout: 20_000 })
    const silenceStatus = await page.locator('.editing-project-status').textContent()
    await page.locator('[data-testid="editing-script-list"] .editing-script-row').first().click()
    await page.waitForFunction(() => document.querySelector('.subtitle-text')?.textContent?.includes('第一句') === true, null, { timeout: 10_000 })
    await page.waitForFunction(() => document.querySelector('.subtitle-overlay:not(.empty) .subtitle-text') !== null, null, { timeout: 10_000 })
    await page.locator('.subtitle-display-trigger').click()
    await page.locator('.subtitle-display-controls[open] button').filter({ hasText: '逐词高亮' }).click()
    await page.waitForFunction(() => document.querySelectorAll('.subtitle-word').length > 0, null, { timeout: 10_000 })
    await page.waitForFunction(() => document.querySelector('.subtitle-word.is-active') !== null, null, { timeout: 10_000 })
    const wordTimingPreview = await page.evaluate(() => ({ total: document.querySelectorAll('.subtitle-word').length, active: document.querySelector('.subtitle-word.is-active')?.textContent ?? '', effectClass: document.querySelector('.subtitle-text')?.classList.contains('is-effect-word-pop') === true }))
    await page.locator('.subtitle-display-controls[open] button').filter({ hasText: '关键词' }).click()
    await page.locator('.subtitle-display-controls[open] button').filter({ hasText: '暖黄' }).evaluate((element) => (element as HTMLButtonElement).click())
    await page.locator('.subtitle-display-controls[open] textarea').fill('第一句')
    await page.waitForFunction(() => Array.from(document.querySelectorAll('.subtitle-emphasis')).map((element) => element.textContent ?? '').join('') === '第一句', null, { timeout: 10_000 })
    const subtitlePresetPreview = await page.evaluate(() => ({ text: Array.from(document.querySelectorAll('.subtitle-emphasis')).map((element) => element.textContent ?? '').join(''), color: getComputedStyle(document.querySelector('.subtitle-text') as HTMLElement).color }))
    await page.locator('.subtitle-display-trigger').click()
    await page.locator('[data-testid="editing-caption-layout-control"] .editing-caption-layout-summary').click()
    await page.locator('[data-testid="editing-caption-layout-source-xPercent"]').fill('42')
    await page.locator('[data-testid="editing-caption-layout-source-yPercent"]').fill('76')
    await page.locator('[data-testid="editing-caption-layout-source-widthPercent"]').fill('68')
    await page.locator('[data-testid="editing-caption-layout-source-fontSizePx"]').fill('64')
    await page.waitForFunction(() => { const line = document.querySelector('.subtitle-overlay.is-editing-caption .subtitle-line') as HTMLElement | null; const text = document.querySelector('.subtitle-overlay.is-editing-caption .subtitle-text') as HTMLElement | null; return line?.style.getPropertyValue('--editing-caption-line-x') === '42%' && line.style.getPropertyValue('--editing-caption-line-y') === '76%' && line.style.getPropertyValue('--editing-caption-line-width') === '68%' && getComputedStyle(text as HTMLElement).fontSize === '64px' })
    const captionLayoutPreview = await page.evaluate(() => { const line = document.querySelector('.subtitle-overlay.is-editing-caption .subtitle-line') as HTMLElement | null; return { x: line?.style.getPropertyValue('--editing-caption-line-x') ?? '', y: line?.style.getPropertyValue('--editing-caption-line-y') ?? '', width: line?.style.getPropertyValue('--editing-caption-line-width') ?? '', fontSize: getComputedStyle(document.querySelector('.subtitle-overlay.is-editing-caption .subtitle-text') as HTMLElement).fontSize } })
    await page.locator('[data-testid="editing-caption-layout-control"] .editing-caption-layout-summary').click()
    const captionCanvasOverlay = page.locator('[data-testid="editing-caption-canvas-overlay-source"]')
    await captionCanvasOverlay.waitFor({ timeout: 10_000 })
    const captionCanvasBox = page.locator('.editing-caption-canvas-box')
    const captionCanvasInitialStyle = await captionCanvasBox.getAttribute('style')
    const captionCanvasBodyBox = await page.locator('.editing-caption-canvas-body').boundingBox()
    if (!captionCanvasBodyBox || !captionCanvasInitialStyle) throw new Error('Caption canvas body was not measurable')
    await page.mouse.move(captionCanvasBodyBox.x + captionCanvasBodyBox.width / 2, captionCanvasBodyBox.y + captionCanvasBodyBox.height / 2)
    await page.mouse.down()
    await page.mouse.move(captionCanvasBodyBox.x + captionCanvasBodyBox.width / 2 + 24, captionCanvasBodyBox.y + captionCanvasBodyBox.height / 2 + 12, { steps: 5 })
    await page.mouse.up()
    await page.waitForFunction((before) => document.querySelector('.editing-caption-canvas-box')?.getAttribute('style') !== before, captionCanvasInitialStyle, { timeout: 10_000 })
    const captionCanvasMovedStyle = await captionCanvasBox.getAttribute('style')
    await page.locator('[data-testid="editing-undo"]').click()
    await page.waitForFunction((before) => document.querySelector('.editing-caption-canvas-box')?.getAttribute('style') === before, captionCanvasInitialStyle, { timeout: 10_000 })
    const captionCanvasRestoredAfterMove = await captionCanvasBox.getAttribute('style')
    const captionCanvasRightHandleBox = await page.locator('.editing-caption-canvas-handle.is-right').boundingBox()
    if (!captionCanvasRightHandleBox) throw new Error('Caption canvas right handle was not measurable')
    await page.mouse.move(captionCanvasRightHandleBox.x + captionCanvasRightHandleBox.width / 2, captionCanvasRightHandleBox.y + captionCanvasRightHandleBox.height / 2)
    await page.mouse.down()
    await page.mouse.move(captionCanvasRightHandleBox.x + captionCanvasRightHandleBox.width / 2 - 24, captionCanvasRightHandleBox.y + captionCanvasRightHandleBox.height / 2, { steps: 5 })
    await page.mouse.up()
    await page.waitForFunction((before) => document.querySelector('.editing-caption-canvas-box')?.getAttribute('style') !== before, captionCanvasInitialStyle, { timeout: 10_000 })
    const captionCanvasResizedStyle = await captionCanvasBox.getAttribute('style')
    await page.locator('[data-testid="editing-undo"]').click()
    await page.waitForFunction((before) => document.querySelector('.editing-caption-canvas-box')?.getAttribute('style') === before, captionCanvasInitialStyle, { timeout: 10_000 })
    const captionCanvasRestoredAfterResize = await captionCanvasBox.getAttribute('style')
    const captionCanvasScreenshotPath = join(smokeHomeDirectory, 'aivplayer-smoke-editing-caption-canvas.png')
    await page.screenshot({ path: captionCanvasScreenshotPath, fullPage: false })
    await app.evaluate(({ dialog }, paths: string[]) => { dialog.showOpenDialog = async () => ({ canceled: false, filePaths: paths }) }, [secondMediaPath, shortMediaPath])
    await page.locator('[data-testid="editing-add-media"]').click()
    await page.waitForFunction(() => document.querySelector('.editing-project-status')?.textContent?.includes('已添加 2 个素材') === true, null, { timeout: 20_000 })
    const editingAssetsPanel = page.locator('[data-testid="editing-assets-panel"]')
    await editingAssetsPanel.waitFor({ timeout: 10_000 })
    const editingAssetCards = editingAssetsPanel.locator('.editing-asset-card')
    const editingAssetCardCount = await editingAssetCards.count()
    const secondAssetCard = editingAssetsPanel.locator('.editing-asset-card').filter({ hasText: 'second-source.mp4' })
    const shortAssetCard = editingAssetsPanel.locator('.editing-asset-card').filter({ hasText: 'short-source.mp4' })
    await secondAssetCard.waitFor({ timeout: 10_000 })
    await shortAssetCard.waitFor({ timeout: 10_000 })
    const videoBlockCountBeforeAssetInsert = await page.locator('[data-testid="editing-video-block-track"] .editing-video-block-item').count()
    await editingAssetsPanel.locator('button[data-testid^="editing-asset-overlay-"]').first().click()
    await page.waitForFunction((before) => document.querySelectorAll('[data-testid="editing-video-block-track"] .editing-video-block-item').length > before, videoBlockCountBeforeAssetInsert, { timeout: 10_000 })
    const videoBlockCountAfterAssetInsert = await page.locator('[data-testid="editing-video-block-track"] .editing-video-block-item').count()
    await editingAssetCards.first().dragTo(page.locator('[data-testid="editing-video-block-track"]'))
    await page.waitForFunction((before) => document.querySelectorAll('[data-testid="editing-video-block-track"] .editing-video-block-item').length > before, videoBlockCountAfterAssetInsert, { timeout: 10_000 })
    const videoBlockCountAfterAssetDrag = await page.locator('[data-testid="editing-video-block-track"] .editing-video-block-item').count()
    await editingAssetsPanel.locator('[role="tab"]').nth(2).click()
    await page.waitForFunction(() => document.querySelectorAll('[data-testid="editing-assets-list"] .editing-asset-card').length === 0, null, { timeout: 10_000 })
    await editingAssetsPanel.locator('[role="tab"]').first().click()
    await page.waitForFunction(() => document.querySelectorAll('[data-testid="editing-assets-list"] .editing-asset-card').length > 0, null, { timeout: 10_000 })
    const mainClipCountBeforeAssetAppend = await page.locator('.editing-clip').count()
    await editingAssetsPanel.locator('.editing-asset-select').first().click()
    await editingAssetsPanel.locator('[data-testid="editing-assets-append-selected"]').click()
    await page.waitForFunction((before) => document.querySelectorAll('.editing-clip').length > before, mainClipCountBeforeAssetAppend, { timeout: 10_000 })
    const mainClipCountAfterAssetAppend = await page.locator('.editing-clip').count()
    await secondAssetCard.locator('.editing-asset-thumb').click()
    await page.locator('[data-testid="editing-asset-preview-dialog"]').waitFor({ timeout: 10_000 })
    const assetPreviewHasVideo = await page.locator('[data-testid="editing-asset-preview-video"]').count() > 0
    const assetPreviewScreenshotPath = join(smokeHomeDirectory, 'aivplayer-smoke-editing-asset-preview.png')
    await page.screenshot({ path: assetPreviewScreenshotPath, fullPage: false })
    await page.locator('.editing-asset-preview-close').click()
    const replacementTarget = await page.evaluate((paths) => {
      const stored = JSON.parse(localStorage.getItem('aivplayer.editing-projects.v1') ?? '{}') as Record<string, { sources: Array<{ id: string; path: string }>; videoClips: Array<{ id: string; sourceId: string; sourceStartSeconds: number; sourceEndSeconds: number }>; captions: Array<{ id: string; sourceId?: string; sourceStartSeconds?: number; sourceEndSeconds?: number; startSeconds: number; durationSeconds: number }> }>
      const project = Object.values(stored).find((item) => item.sources?.[0]?.path === paths.primary && item.sources.some((source) => source.path === paths.replacement))
      if (!project) return null
      const replacementSourceId = project.sources.find((source) => source.path === paths.replacement)?.id
      if (!replacementSourceId) return null
      let editedStartSeconds = 0
      for (const [index, clip] of project.videoClips.entries()) {
        const editedEndSeconds = editedStartSeconds + clip.sourceEndSeconds - clip.sourceStartSeconds
        const caption = project.captions.find((item) => item.sourceId === clip.sourceId && item.sourceStartSeconds !== undefined && item.sourceEndSeconds !== undefined && Math.min(item.startSeconds + item.durationSeconds, editedEndSeconds) - Math.max(item.startSeconds, editedStartSeconds) > 0.001)
        if (caption) return { index, clipId: clip.id, sourceId: clip.sourceId, editedStartSeconds, editedEndSeconds, clip, caption, replacementSourceId }
        editedStartSeconds = editedEndSeconds
      }
      return null
    }, { primary: mediaPath, replacement: secondMediaPath })
    if (!replacementTarget) throw new Error('Could not find a caption-anchored clip for cross-source replacement')
    await secondAssetCard.dragTo(page.locator('.editing-clip').nth(replacementTarget.index))
    await page.waitForFunction(() => document.querySelector('.editing-project-status')?.textContent?.includes('second-source.mp4') === true, null, { timeout: 10_000 })
    const assetReplaceStatus = await page.locator('.editing-project-status').textContent()
    const afterSuccessfulReplace = await page.evaluate((paths) => {
      const stored = JSON.parse(localStorage.getItem('aivplayer.editing-projects.v1') ?? '{}') as Record<string, { sources: Array<{ id: string; path: string }>; videoClips: Array<{ id: string; sourceId: string; sourceStartSeconds: number; sourceEndSeconds: number }>; captions: Array<{ id: string; sourceId?: string; sourceStartSeconds?: number; sourceEndSeconds?: number; startSeconds: number; durationSeconds: number }> }>
      const project = Object.values(stored).find((item) => item.sources?.[0]?.path === paths.primary)
      const sourceId = project?.sources.find((source) => source.path === paths.replacement)?.id
      const clip = project?.videoClips.find((item) => item.id === paths.clipId)
      const caption = project?.captions.find((item) => item.id === paths.captionId)
      return { sourceId, clip, caption }
    }, { primary: mediaPath, replacement: secondMediaPath, clipId: replacementTarget.clipId, captionId: replacementTarget.caption.id })
    const expectedCaptionStart = Math.max(replacementTarget.caption.startSeconds, replacementTarget.editedStartSeconds)
    const expectedCaptionEnd = Math.min(replacementTarget.caption.startSeconds + replacementTarget.caption.durationSeconds, replacementTarget.editedEndSeconds)
    const captionReanchored = afterSuccessfulReplace.sourceId === replacementTarget.replacementSourceId && afterSuccessfulReplace.clip?.sourceId === replacementTarget.replacementSourceId && Math.abs((afterSuccessfulReplace.clip?.sourceEndSeconds ?? 0) - (replacementTarget.clip.sourceEndSeconds - replacementTarget.clip.sourceStartSeconds)) < 0.01 && afterSuccessfulReplace.caption?.sourceId === replacementTarget.replacementSourceId && Math.abs((afterSuccessfulReplace.caption.sourceStartSeconds ?? -1) - (expectedCaptionStart - replacementTarget.editedStartSeconds)) < 0.01 && Math.abs((afterSuccessfulReplace.caption.sourceEndSeconds ?? -1) - (expectedCaptionEnd - replacementTarget.editedStartSeconds)) < 0.01
    await shortAssetCard.dragTo(page.locator('.editing-clip').nth(replacementTarget.index))
    await page.waitForFunction(() => document.querySelector('.editing-project-status')?.textContent?.includes('时长不足') === true, null, { timeout: 10_000 })
    const assetReplaceTooShortStatus = await page.locator('.editing-project-status').textContent()
    const afterShortReplace = await page.evaluate((paths) => {
      const stored = JSON.parse(localStorage.getItem('aivplayer.editing-projects.v1') ?? '{}') as Record<string, { sources: Array<{ id: string; path: string }>; videoClips: Array<{ id: string; sourceId: string }> }>
      const project = Object.values(stored).find((item) => item.sources?.[0]?.path === paths.primary)
      return project?.videoClips.find((item) => item.id === paths.clipId)?.sourceId ?? null
    }, { primary: mediaPath, clipId: replacementTarget.clipId })
    const mixedSourceOutputPath = join(smokeHomeDirectory, 'aivplayer-smoke-mixed-source.mp4')
    const mixedSourceExportResult = await page.evaluate(async ({ sourcePath, secondPath, targetPath }) => window.aiv.exportMediaTimeline({ mediaPath: sourcePath, clips: [{ mediaPath: sourcePath, startSeconds: 0, endSeconds: 1 }, { mediaPath: secondPath, startSeconds: 0, endSeconds: 1 }], mode: 'video', outputVideoPath: targetPath }), { sourcePath: mediaPath, secondPath: secondMediaPath, targetPath: mixedSourceOutputPath })
    const mixedSourceOutputStats = mixedSourceExportResult.success ? await stat(mixedSourceOutputPath).catch(() => null) : null
    await page.locator('[data-testid="editing-export"]').click()
    await page.locator('[data-testid="editing-export-audit"]').waitFor({ timeout: 10_000 })
    const exportAuditReady = await page.locator('[data-testid="editing-export-audit"]').textContent()
    const exportConfirmEnabled = !(await page.locator('[data-testid="editing-export-confirm"]').isDisabled())
    await page.locator('.clip-export-mode-option').filter({ hasText: '烧录字幕' }).click()
    await page.locator('[data-testid="editing-export-capability"]').waitFor({ timeout: 10_000 })
    await page.waitForFunction(() => document.querySelector('[data-testid="editing-export-capability"]')?.getAttribute('data-state') !== 'checking', null, { timeout: 10_000 })
    const captionCapabilityMessage = await page.locator('[data-testid="editing-export-capability"]').textContent()
    const burnInExportConfirmEnabled = !(await page.locator('[data-testid="editing-export-confirm"]').isDisabled())
    await page.locator('.editing-export-confirm-cancel').click()
    const assetLibraryPreview = { cards: editingAssetCardCount, videoBlocksBefore: videoBlockCountBeforeAssetInsert, videoBlocksAfterInsert: videoBlockCountAfterAssetInsert, videoBlocksAfterDrag: videoBlockCountAfterAssetDrag, mainClipsBeforeAppend: mainClipCountBeforeAssetAppend, mainClipsAfterAppend: mainClipCountAfterAssetAppend, previewHasVideo: assetPreviewHasVideo, previewScreenshot: assetPreviewScreenshotPath, replaceStatus: assetReplaceStatus ?? '', captionReanchored, shortReplaceStatus: assetReplaceTooShortStatus ?? '', shortReplacePreserved: afterShortReplace === replacementTarget.replacementSourceId, mixedSourceExport: { success: mixedSourceExportResult.success, outputBytes: mixedSourceOutputStats?.size ?? 0 }, exportAuditReady: exportAuditReady ?? '', exportConfirmEnabled, captionCapabilityMessage: captionCapabilityMessage ?? '', burnInExportConfirmEnabled }
    const screenshotPath = join(smokeHomeDirectory, 'aivplayer-smoke-editing-script.png')
    await page.screenshot({ path: screenshotPath, fullPage: false })

    console.log('AIVPlayer Smoke Editing Script')
    console.log(`Media: ${mediaPath}`)
    console.log(`Before: ${JSON.stringify(before)}`)
    console.log(`Script inline edit: ${JSON.stringify({ segmentId: scriptEditSegmentId, before: scriptTextBeforeEdit, after: scriptTextAfterEdit, persisted: persistedScriptEdit })}`)
    console.log(`Video block motion preview: ${JSON.stringify(videoBlockMotionPreview)}`)
    console.log(`Reusable graphic preset: ${reusableGraphicPreset ?? ''}`)
    console.log(`Reusable graphic asset count: ${reusableGraphicAsset}`)
    console.log(`Editing theme preview: ${JSON.stringify({ ...themePreview, savedThemeCount })}`)
    console.log(`Editing canvas preview: ${JSON.stringify(canvasPreview)}`)
    console.log(`Extended transition preview: ${JSON.stringify({ circle: circleTransitionPreview })}`)
    console.log(`Transition preview cards: ${transitionPreviewCardCount}`)
    console.log(`After delete: ${JSON.stringify(afterDelete)}`)
    console.log(`After restore: ${JSON.stringify(afterRestore)}`)
    console.log(`Scene split: ${JSON.stringify({ before: sceneClipCountBefore, after: sceneClipCountAfter, multiSelectionCount, multiSelectionDeletedClipCount })}`)
    console.log(`Overlay multi-move: ${JSON.stringify({ selection: multiOverlaySelectionCount, graphicBeforeGroupMove, graphicAfterGroupMove })}`)
    console.log(`Selection toolbar screenshot: ${selectionToolbarScreenshotPath}`)
    console.log(`Overlay duplicate: ${JSON.stringify({ selection: duplicateSelectionCount, before: overlayCountsBeforeDuplicate, after: overlayCountsAfterDuplicate })}`)
    console.log(`Shortcut duplicate: ${JSON.stringify({ before: graphicCountBeforeShortcutDuplicate, after: graphicCountAfterShortcutDuplicate })}`)
    console.log(`Keyboard nudge: ${JSON.stringify({ graphicBeforeShiftNudge, graphicAfterShiftNudge })}`)
    console.log(`Graphic canvas preview: ${JSON.stringify({ initial: graphicCanvasInitialStyle, moved: graphicCanvasMovedStyle, restoredAfterMove: graphicCanvasRestoredAfterMove, resized: graphicCanvasResizedStyle, restoredAfterResize: graphicCanvasRestoredAfterResize, rotated: graphicCanvasRotatedStyle, restoredAfterRotate: graphicCanvasRestoredAfterRotate, screenshot: graphicCanvasScreenshotPath })}`)
    console.log(`Overlay trim: ${JSON.stringify({ graphicTrimBefore, graphicTrimAfter })}`)
    console.log(`Overlay track reorder: ${JSON.stringify({ before: overlayTrackOrderBefore, after: overlayTrackOrderAfter, layers: overlayLayerPreview, screenshot: overlayTrackOrderScreenshotPath })}`)
    console.log(`Silence removal: ${JSON.stringify({ status: silenceStatus })}`)
    console.log(`Subtitle word timing preview: ${JSON.stringify(wordTimingPreview)}`)
    console.log(`Subtitle preset preview: ${JSON.stringify(subtitlePresetPreview)}`)
    console.log(`Caption layout preview: ${JSON.stringify(captionLayoutPreview)}`)
    console.log(`Caption canvas preview: ${JSON.stringify({ initial: captionCanvasInitialStyle, moved: captionCanvasMovedStyle, restoredAfterMove: captionCanvasRestoredAfterMove, resized: captionCanvasResizedStyle, restoredAfterResize: captionCanvasRestoredAfterResize, screenshot: captionCanvasScreenshotPath })}`)
    console.log(`Asset library preview: ${JSON.stringify(assetLibraryPreview)}`)
    console.log(`Punch-in export: ${JSON.stringify({ success: punchInExportResult.success, message: punchInExportResult.message, outputBytes: punchInOutputStats?.size ?? 0 })}`)
    console.log(`Transition export: ${JSON.stringify({ success: transitionExportResult.success, message: transitionExportResult.message, outputBytes: transitionOutputStats?.size ?? 0 })}`)
    console.log(`Multi-transition export: ${JSON.stringify({ success: multiTransitionExportResult.success, message: multiTransitionExportResult.message, outputBytes: multiTransitionOutputStats?.size ?? 0 })}`)
    console.log(`Graphic export: ${JSON.stringify({ success: graphicOutputResult.success, message: graphicOutputResult.message, outputBytes: graphicOutputStats?.size ?? 0 })}`)
    console.log(`Caption effect export: ${JSON.stringify({ available: hasSubtitleFilter, success: captionEffectExportResult.success, message: captionEffectExportResult.message, outputBytes: captionEffectOutputStats?.size ?? 0 })}`)
    console.log(`Video block export: ${JSON.stringify({ success: videoBlockExportResult.success, message: videoBlockExportResult.message, outputBytes: videoBlockOutputStats?.size ?? 0 })}`)
    console.log(`Split export: ${JSON.stringify({ success: splitExportResult.success, message: splitExportResult.message, outputBytes: splitOutputStats?.size ?? 0 })}`)
    console.log(`Treatment screenshot: ${treatmentScreenshotPath}`)
    console.log(`Console errors: ${JSON.stringify(consoleErrors)}`)
    console.log(`Screenshot: ${screenshotPath}`)
    if (captionLayoutPreview.x !== '42%' || captionLayoutPreview.y !== '76%' || captionLayoutPreview.width !== '68%' || captionLayoutPreview.fontSize !== '64px' || captionCanvasMovedStyle === captionCanvasInitialStyle || captionCanvasRestoredAfterMove !== captionCanvasInitialStyle || captionCanvasResizedStyle === captionCanvasInitialStyle || captionCanvasRestoredAfterResize !== captionCanvasInitialStyle || graphicCanvasMovedStyle === graphicCanvasInitialStyle || graphicCanvasRestoredAfterMove !== graphicCanvasInitialStyle || graphicCanvasResizedStyle === graphicCanvasInitialStyle || graphicCanvasRestoredAfterResize !== graphicCanvasInitialStyle || graphicCanvasRotatedStyle === graphicCanvasInitialStyle || graphicCanvasRestoredAfterRotate !== graphicCanvasInitialStyle) process.exitCode = 1
    if (!multiSelectionCount || multiSelectionDeletedClipCount >= sceneClipCountAfter) process.exitCode = 1
    if (!multiOverlaySelectionCount || graphicBeforeGroupMove === graphicAfterGroupMove) process.exitCode = 1
    if (!duplicateSelectionCount || overlayCountsAfterDuplicate.captions <= overlayCountsBeforeDuplicate.captions || overlayCountsAfterDuplicate.graphics <= overlayCountsBeforeDuplicate.graphics || overlayCountsAfterDuplicate.videoBlocks <= overlayCountsBeforeDuplicate.videoBlocks) process.exitCode = 1
    if (graphicCountAfterShortcutDuplicate <= graphicCountBeforeShortcutDuplicate) process.exitCode = 1
    if (Number.parseFloat(graphicAfterShiftNudge) - Number.parseFloat(graphicBeforeShiftNudge) <= 1) process.exitCode = 1
    if (graphicTrimBefore === graphicTrimAfter) process.exitCode = 1
    if (overlayTrackOrderBefore.join('|') !== 'captions|graphics|videoBlocks' && overlayTrackOrderBefore.join('|') !== 'videoBlocks|graphics|captions') process.exitCode = 1
    if (overlayTrackOrderAfter[0] !== 'captions' || overlayTrackOrderAfter.length !== 3 || overlayLayerPreview.caption !== '10') process.exitCode = 1

    if (before.rows !== 3 || before.deleted !== 0 || transitionPreviewCardCount !== 11 || !persistedScriptEdit || scriptTextBeforeEdit === scriptTextAfterEdit || canvasPreview.preset !== 'portrait' || !canvasPreview.safeArea || canvasPreview.objectFit !== 'cover' || !canvasPreview.summary.includes('1080') || sceneClipCountAfter !== sceneClipCountBefore + 2 || treatmentBeforeSplit.treatment !== 'scale(1.6)' || treatmentBeforeSplit.treatmentOrigin !== '0% 50%' || !transitionPreview.includes('inset') || !circleTransitionPreview.includes('circle') || before.filter !== 'brightness(1.2) contrast(1) saturate(1)' || !reusableGraphicPreset?.includes('一句话重点') || reusableGraphicAsset !== 1 || themePreview.warmActive !== true || themePreview.frameClass !== true || themePreview.graphicVariant !== true || themePreview.captionEffectActive !== true || themePreview.savedThemeCount !== 1 || savedThemeCount !== 1 || graphicTextPreview !== '烟测标题-修改' || before.graphicLeft === '0%' || !splitPreview.surface.includes('is-split-left') || !splitPreview.block.includes('is-split-left') || splitPreview.width !== '60%' || splitPreview.radius !== '18px' || splitPreview.border !== '4px' || !videoBlockMotionPreview.transform.includes('translateX') || wordTimingPreview.total === 0 || wordTimingPreview.active.length === 0 || afterDelete.deleted !== 1 || afterRestore.deleted !== 0 || editingAssetCardCount !== 3 || videoBlockCountAfterAssetInsert !== videoBlockCountBeforeAssetInsert + 1 || videoBlockCountAfterAssetDrag !== videoBlockCountAfterAssetInsert + 1 || mainClipCountAfterAssetAppend !== mainClipCountBeforeAssetAppend + 1 || !assetPreviewHasVideo || !assetReplaceStatus?.includes('second-source.mp4') || !captionReanchored || !assetReplaceTooShortStatus?.includes('时长不足') || !assetLibraryPreview.shortReplacePreserved || !mixedSourceExportResult.success || !mixedSourceOutputStats || mixedSourceOutputStats.size <= 0 || !assetLibraryPreview.exportAuditReady.includes('检查通过') || !assetLibraryPreview.exportConfirmEnabled || (hasSubtitleFilter && !assetLibraryPreview.burnInExportConfirmEnabled) || (!hasSubtitleFilter && assetLibraryPreview.burnInExportConfirmEnabled) || !punchInExportResult.success || !punchInOutputStats || punchInOutputStats.size <= 0 || !transitionExportResult.success || !transitionOutputStats || transitionOutputStats.size <= 0 || !multiTransitionExportResult.success || !multiTransitionOutputStats || multiTransitionOutputStats.size <= 0 || !graphicOutputResult.success || !graphicOutputStats || graphicOutputStats.size <= 0 || !captionEffectExportResult.success && hasSubtitleFilter || hasSubtitleFilter && (!captionEffectOutputStats || captionEffectOutputStats.size <= 0) || !videoBlockOutputStats || !videoBlockExportResult.success || !splitExportResult.success || !splitOutputStats || splitOutputStats.size <= 0 || consoleErrors.length > 0) process.exitCode = 1
  } finally {
    await app.close()
  }
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
