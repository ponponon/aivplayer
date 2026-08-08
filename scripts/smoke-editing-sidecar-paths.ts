import { _electron as electron } from 'playwright'
import { copyFile, mkdtemp, rename, utimes, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'

const sourceMediaPath = process.argv[2] ?? '/Users/ponponon/Music/aivplayer_test_video_1min.mp4'

function makeVtt(text: string): string {
  return `WEBVTT\n\n00:00:00.000 --> 00:00:01.000\n${text}\n`
}

async function main(): Promise<void> {
  const smokeDirectory = await mkdtemp(join(tmpdir(), 'aivplayer-smoke-sidecar-paths-'))
  const mediaPath = join(smokeDirectory, 'sidecar-paths-smoke.mp4')
  const sourceEmptyPath = join(smokeDirectory, 'sidecar-paths-smoke.SRT')
  const sourcePath = join(smokeDirectory, 'sidecar-paths-smoke.VTT')
  const sourceBackupPath = join(smokeDirectory, 'sidecar-paths-smoke.VTT.disabled')
  const translationEmptyPath = join(smokeDirectory, 'sidecar-paths-smoke.translated.SRT')
  const translationPath = join(smokeDirectory, 'sidecar-paths-smoke.zh-CN.srt')
  const translationBackupPath = join(smokeDirectory, 'sidecar-paths-smoke.zh-CN.srt.disabled')
  const translationAlternatePath = join(smokeDirectory, 'sidecar-paths-smoke.zh-CN.VTT')
  const translationAlternateBackupPath = join(smokeDirectory, 'sidecar-paths-smoke.zh-CN.VTT.disabled')
  const smokeHomeDirectory = await mkdtemp(join(tmpdir(), 'aivplayer-smoke-sidecar-paths-home-'))
  await copyFile(sourceMediaPath, mediaPath)
  await writeFile(sourceEmptyPath, '')
  await writeFile(sourcePath, makeVtt('初始跨设备原文'))
  await writeFile(translationEmptyPath, '')
  await writeFile(translationPath, makeVtt('初始跨设备译文'))
  await writeFile(translationAlternatePath, makeVtt('初始跨设备备用译文'))

  let app = await electron.launch({
    args: ['--no-sandbox', '--in-process-gpu', `--user-data-dir=${smokeHomeDirectory}`, 'out/main/index.js', mediaPath],
    env: { ...process.env, HOME: smokeHomeDirectory }
  })

  try {
    let page = await app.firstWindow()
    const consoleErrors: string[] = []
    const attachConsoleErrorListeners = (windowPage: typeof page): void => {
      windowPage.on('console', (message) => { if (message.type() === 'error') consoleErrors.push(message.text()) })
      windowPage.on('pageerror', (error) => consoleErrors.push(error.message))
    }
    attachConsoleErrorListeners(page)

    const openEditor = async (): Promise<void> => {
      await page.waitForLoadState('domcontentloaded')
      await page.waitForSelector('video.video-surface', { timeout: 10_000 })
      if (await page.locator('[data-testid="editing-timeline"]').count() === 0) await page.locator('.clip-editor-tool-button').click()
      await page.locator('[data-testid="editing-timeline"]').waitFor({ timeout: 10_000 })
      await page.locator('[data-testid^="editing-script-row-"]').first().waitFor({ timeout: 10_000 })
    }

    const readStoredProject = async (): Promise<{ id?: string; captionSourceRevision?: string; captionSourceRevisions?: Record<string, { source: number | null; translation: number | null }>; captionSourcePaths?: Record<string, { source: string | null; translation: string | null }>; captions: Array<{ text: string; kind?: 'source' | 'translation' }> } | null> => page.evaluate(() => {
      const entries = Object.values(JSON.parse(localStorage.getItem('aivplayer.editing-projects.v1') ?? '{}') as Record<string, { id?: string; captionSourceRevision?: string; captionSourceRevisions?: Record<string, { source: number | null; translation: number | null }>; captionSourcePaths?: Record<string, { source: string | null; translation: string | null }>; captions: Array<{ text: string; kind?: 'source' | 'translation' }> }>)
      return entries[0] ?? null
    })

    await page.waitForLoadState('domcontentloaded')
    await page.waitForSelector('video.video-surface', { timeout: 10_000 })
    await page.evaluate(() => localStorage.setItem('aivplayer.editing-ui-preferences.v1', JSON.stringify({ schemaVersion: 1, projects: { 'stale-project-from-removed-index': { detailsOpen: true, openGroups: { stale: true } } } })))
    await openEditor()
    const baseline = await readStoredProject()
    if (!baseline?.captionSourceRevision || !baseline.captionSourceRevisions || !baseline.captions.some((caption) => caption.text.includes('初始跨设备原文'))) throw new Error(`Sidecar path baseline was not loaded: ${JSON.stringify(baseline)}`)
    const sessionCandidateDetails = page.locator('[data-testid="editing-project-status-details"]')
    await sessionCandidateDetails.waitFor({ timeout: 10_000 })
    await sessionCandidateDetails.locator(':scope > summary').click()
    const sessionCandidateFirstGroup = sessionCandidateDetails.locator('.editing-project-status-details-group').first()
    await sessionCandidateFirstGroup.locator(':scope > summary').click()
    const candidateAuditSessionInitialOuterOpen = await sessionCandidateDetails.evaluate((details) => (details as HTMLDetailsElement).open)
    const candidateAuditSessionInitialGroupOpen = await sessionCandidateFirstGroup.evaluate((group) => (group as HTMLDetailsElement).open)
    await page.locator('[data-testid="editing-rebuild-caption-manifest"]').click()
    await page.waitForTimeout(50)
    await page.waitForFunction(() => {
      const button = document.querySelector('[data-testid="editing-rebuild-caption-manifest"]') as HTMLButtonElement | null
      return Boolean(button && !button.disabled)
    }, undefined, { timeout: 10_000 })
    await sessionCandidateDetails.waitFor({ timeout: 10_000 })
    const candidateAuditSessionRefreshedOuterOpen = await sessionCandidateDetails.evaluate((details) => (details as HTMLDetailsElement).open)
    const candidateAuditSessionRefreshedGroupOpen = await sessionCandidateFirstGroup.evaluate((group) => (group as HTMLDetailsElement).open)
    const candidateAuditSessionStorageValue = await page.evaluate(() => localStorage.getItem('aivplayer.editing-project-status'))
    const candidateAuditSessionScreenshotPath = join(smokeHomeDirectory, 'aivplayer-smoke-sidecar-paths-session.png')
    await page.screenshot({ path: candidateAuditSessionScreenshotPath, fullPage: false })
    await rename(sourcePath, sourceBackupPath)
    await rename(translationPath, translationBackupPath)
    await rename(translationAlternatePath, translationAlternateBackupPath)
    await page.locator('[data-testid="editing-rebuild-caption-manifest"]').click()
    await page.waitForFunction(() => {
      const button = document.querySelector('[data-testid="editing-rebuild-caption-manifest"]') as HTMLButtonElement | null
      return Boolean(button && !button.disabled)
    }, undefined, { timeout: 10_000 })
    await page.waitForFunction(() => document.querySelector('[data-testid="editing-project-status-details"]') === null, undefined, { timeout: 10_000 })
    const candidateAuditClearedDetailsCount = await page.locator('[data-testid="editing-project-status-details"]').count()
    const candidateAuditClearedStatus = await page.locator('[data-testid="editing-project-status-message"]').textContent()
    await rename(sourceBackupPath, sourcePath)
    await rename(translationBackupPath, translationPath)
    await rename(translationAlternateBackupPath, translationAlternatePath)
    await page.locator('[data-testid="editing-rebuild-caption-manifest"]').click()
    await page.waitForFunction(() => {
      const button = document.querySelector('[data-testid="editing-rebuild-caption-manifest"]') as HTMLButtonElement | null
      return Boolean(button && !button.disabled)
    }, undefined, { timeout: 10_000 })
    await sessionCandidateDetails.waitFor({ timeout: 10_000 })
    const candidateAuditRestoredDetailsCount = await sessionCandidateDetails.count()
    await page.waitForFunction(() => localStorage.getItem('aivplayer.editing-ui-preferences.v1') !== null, undefined, { timeout: 10_000 })
    const candidateAuditPrunedPreference = await page.evaluate(({ projectId, smokeDirectory }) => {
      const raw = localStorage.getItem('aivplayer.editing-ui-preferences.v1') ?? ''
      const parsed = JSON.parse(raw) as { projects?: Record<string, { detailsOpen?: boolean; openGroups?: Record<string, boolean> }> }
      return {
        staleProjectPresent: Boolean(parsed.projects?.['stale-project-from-removed-index']),
        currentProjectPresent: projectId ? Boolean(parsed.projects?.[projectId]) : false,
        containsSmokePath: raw.includes(smokeDirectory)
      }
    }, { projectId: baseline.id ?? null, smokeDirectory })
    const candidateAuditResetSeed = await page.evaluate(({ projectId }) => {
      const raw = localStorage.getItem('aivplayer.editing-ui-preferences.v1') ?? '{}'
      const parsed = JSON.parse(raw) as { projects?: Record<string, { detailsOpen?: boolean; openGroups?: Record<string, boolean> }> }
      const current = projectId ? parsed.projects?.[projectId] ?? null : null
      parsed.projects = { ...(parsed.projects ?? {}), 'other-project-kept-by-reset': { detailsOpen: true, openGroups: { other: true } } }
      localStorage.setItem('aivplayer.editing-ui-preferences.v1', JSON.stringify(parsed))
      return { current }
    }, { projectId: baseline.id ?? null })
    if (!candidateAuditResetSeed.current?.detailsOpen || Object.values(candidateAuditResetSeed.current.openGroups ?? {}).filter(Boolean).length !== 1) throw new Error('Current project preference was not ready for reset verification')
    const candidateAuditResetButton = page.locator('[data-testid="editing-reset-candidate-details-preferences"]')
    await candidateAuditResetButton.waitFor({ timeout: 10_000 })
    await candidateAuditResetButton.click()
    await page.waitForFunction(({ projectId }) => {
      const parsed = JSON.parse(localStorage.getItem('aivplayer.editing-ui-preferences.v1') ?? '{}') as { projects?: Record<string, { detailsOpen?: boolean; openGroups?: Record<string, boolean> }> }
      const current = projectId ? parsed.projects?.[projectId] : undefined
      if (!current) return false
      return Boolean(parsed.projects?.['other-project-kept-by-reset']) && current.detailsOpen === false && Object.values(current.openGroups ?? {}).every((open) => open === false)
    }, { projectId: baseline.id ?? null }, { timeout: 10_000 })
    const candidateAuditResetOuterOpen = await sessionCandidateDetails.evaluate((details) => (details as HTMLDetailsElement).open)
    const candidateAuditResetGroupOpen = await sessionCandidateFirstGroup.evaluate((group) => (group as HTMLDetailsElement).open)
    const candidateAuditResetPreference = await page.evaluate(({ projectId, smokeDirectory }) => {
      const raw = localStorage.getItem('aivplayer.editing-ui-preferences.v1') ?? ''
      const parsed = JSON.parse(raw) as { projects?: Record<string, { detailsOpen?: boolean; openGroups?: Record<string, boolean> }> }
      const other = parsed.projects?.['other-project-kept-by-reset']
      const current = projectId ? parsed.projects?.[projectId] : undefined
      return {
        currentProjectPresent: Boolean(current),
        currentDetailsOpen: current?.detailsOpen ?? true,
        currentOpenGroupCount: Object.values(current?.openGroups ?? {}).filter(Boolean).length,
        otherProjectPresent: Boolean(other),
        otherDetailsOpen: other?.detailsOpen ?? false,
        otherOpenGroupCount: Object.values(other?.openGroups ?? {}).filter(Boolean).length,
        containsSmokePath: raw.includes(smokeDirectory)
      }
    }, { projectId: baseline.id ?? null, smokeDirectory })
    await page.evaluate(({ projectId, current }) => {
      if (!projectId || !current) return
      const parsed = JSON.parse(localStorage.getItem('aivplayer.editing-ui-preferences.v1') ?? '{}') as { projects?: Record<string, unknown> }
      parsed.projects = { ...(parsed.projects ?? {}), [projectId]: current, 'other-project-kept-by-reset': { detailsOpen: true, openGroups: { other: true } } }
      localStorage.setItem('aivplayer.editing-ui-preferences.v1', JSON.stringify(parsed))
    }, { projectId: baseline.id ?? null, current: candidateAuditResetSeed.current })
    await sessionCandidateDetails.locator(':scope > summary').click()
    await sessionCandidateFirstGroup.locator(':scope > summary').click()
    await page.waitForFunction(({ projectId }) => {
      const parsed = JSON.parse(localStorage.getItem('aivplayer.editing-ui-preferences.v1') ?? '{}') as { projects?: Record<string, { detailsOpen?: boolean; openGroups?: Record<string, boolean> }> }
      const current = projectId ? parsed.projects?.[projectId] : undefined
      return current?.detailsOpen === true && Object.values(current.openGroups ?? {}).some(Boolean)
    }, { projectId: baseline.id ?? null }, { timeout: 10_000 })
    const candidateAuditGlobalResetButton = page.locator('[data-testid="editing-reset-all-candidate-details-preferences"]')
    await candidateAuditGlobalResetButton.waitFor({ timeout: 10_000 })
    const nextConfirmDialog = (accept: boolean): Promise<string> => new Promise((resolve) => {
      page.once('dialog', async (dialog) => {
        const message = dialog.message()
        if (accept) await dialog.accept()
        else await dialog.dismiss()
        resolve(message)
      })
    })
    const cancelledDialog = nextConfirmDialog(false)
    await candidateAuditGlobalResetButton.click()
    const candidateAuditGlobalResetDialogShown = await cancelledDialog
    const candidateAuditGlobalResetOuterOpenAfterCancel = await sessionCandidateDetails.evaluate((details) => (details as HTMLDetailsElement).open)
    const candidateAuditGlobalResetGroupOpenAfterCancel = await sessionCandidateFirstGroup.evaluate((group) => (group as HTMLDetailsElement).open)
    const candidateAuditGlobalResetCancelled = await page.evaluate(({ projectId }) => {
      const parsed = JSON.parse(localStorage.getItem('aivplayer.editing-ui-preferences.v1') ?? '{}') as { projects?: Record<string, { detailsOpen?: boolean; openGroups?: Record<string, boolean> }> }
      const current = projectId ? parsed.projects?.[projectId] : undefined
      const other = parsed.projects?.['other-project-kept-by-reset']
      return Boolean(current?.detailsOpen) && Object.values(current?.openGroups ?? {}).some(Boolean) && Boolean(other?.detailsOpen) && Object.values(other?.openGroups ?? {}).some(Boolean)
    }, { projectId: baseline.id ?? null })
    const acceptedDialog = nextConfirmDialog(true)
    await candidateAuditGlobalResetButton.click()
    const candidateAuditGlobalResetAcceptedDialog = await acceptedDialog
    await page.waitForFunction(({ projectId }) => {
      const parsed = JSON.parse(localStorage.getItem('aivplayer.editing-ui-preferences.v1') ?? '{}') as { projects?: Record<string, { detailsOpen?: boolean; openGroups?: Record<string, boolean> }> }
      const current = projectId ? parsed.projects?.[projectId] : undefined
      return current?.detailsOpen === false && Object.values(current?.openGroups ?? {}).every((open) => open === false) && !parsed.projects?.['other-project-kept-by-reset']
    }, { projectId: baseline.id ?? null }, { timeout: 10_000 })
    const candidateAuditGlobalResetOuterOpen = await sessionCandidateDetails.evaluate((details) => (details as HTMLDetailsElement).open)
    const candidateAuditGlobalResetGroupOpen = await sessionCandidateFirstGroup.evaluate((group) => (group as HTMLDetailsElement).open)
    const candidateAuditGlobalResetPreference = await page.evaluate(({ projectId, smokeDirectory }) => {
      const raw = localStorage.getItem('aivplayer.editing-ui-preferences.v1') ?? ''
      const parsed = JSON.parse(raw) as { projects?: Record<string, { detailsOpen?: boolean; openGroups?: Record<string, boolean> }> }
      const current = projectId ? parsed.projects?.[projectId] : undefined
      return {
        currentProjectPresent: Boolean(current),
        currentDetailsOpen: current?.detailsOpen ?? true,
        currentOpenGroupCount: Object.values(current?.openGroups ?? {}).filter(Boolean).length,
        otherProjectPresent: Boolean(parsed.projects?.['other-project-kept-by-reset']),
        remainingProjectCount: Object.keys(parsed.projects ?? {}).length,
        containsSmokePath: raw.includes(smokeDirectory)
      }
    }, { projectId: baseline.id ?? null, smokeDirectory })
    const candidateAuditGlobalResetScreenshotPath = join(smokeHomeDirectory, 'aivplayer-smoke-sidecar-paths-global-reset.png')
    await page.screenshot({ path: candidateAuditGlobalResetScreenshotPath, fullPage: false })
    await page.evaluate(({ projectId, current }) => {
      if (!projectId || !current) return
      const parsed = JSON.parse(localStorage.getItem('aivplayer.editing-ui-preferences.v1') ?? '{}') as { projects?: Record<string, unknown> }
      parsed.projects = { ...(parsed.projects ?? {}), [projectId]: current }
      localStorage.setItem('aivplayer.editing-ui-preferences.v1', JSON.stringify(parsed))
    }, { projectId: baseline.id ?? null, current: candidateAuditResetSeed.current })

    await app.close()
    app = await electron.launch({
      args: ['--no-sandbox', '--in-process-gpu', `--user-data-dir=${smokeHomeDirectory}`, 'out/main/index.js', mediaPath],
      env: { ...process.env, HOME: smokeHomeDirectory }
    })
    page = await app.firstWindow()
    attachConsoleErrorListeners(page)
    await openEditor()
    const restartedCandidateDetails = page.locator('[data-testid="editing-project-status-details"]')
    await restartedCandidateDetails.waitFor({ timeout: 10_000 })
    const restartedCandidateFirstGroup = restartedCandidateDetails.locator('.editing-project-status-details-group').first()
    const candidateAuditRestartedOuterOpen = await restartedCandidateDetails.evaluate((details) => (details as HTMLDetailsElement).open)
    const candidateAuditRestartedGroupOpen = await restartedCandidateFirstGroup.evaluate((group) => (group as HTMLDetailsElement).open)
    const candidateAuditRestartedPreference = await page.evaluate(({ projectId, smokeDirectory }) => {
      const raw = localStorage.getItem('aivplayer.editing-ui-preferences.v1') ?? ''
      const parsed = JSON.parse(raw) as { schemaVersion?: number; projects?: Record<string, { detailsOpen?: boolean; openGroups?: Record<string, boolean> }> }
      const project = projectId ? parsed.projects?.[projectId] : undefined
      return {
        schemaVersion: parsed.schemaVersion ?? null,
        detailsOpen: project?.detailsOpen ?? null,
        openGroupCount: Object.values(project?.openGroups ?? {}).filter(Boolean).length,
        containsSmokePath: raw.includes(smokeDirectory)
      }
    }, { projectId: baseline.id ?? null, smokeDirectory })
    const candidateAuditRestartScreenshotPath = join(smokeHomeDirectory, 'aivplayer-smoke-sidecar-paths-restarted.png')
    await page.screenshot({ path: candidateAuditRestartScreenshotPath, fullPage: false })
    const candidateAuditDetails = page.locator('[data-testid="editing-project-status-details"]')
    const candidateAuditGroups = candidateAuditDetails.locator('.editing-project-status-details-group')

    const revisionMs = Date.now() + 5_000
    await writeFile(sourcePath, makeVtt('更新跨设备原文'))
    await writeFile(translationPath, makeVtt('更新跨设备译文'))
    await writeFile(translationAlternatePath, makeVtt('更新跨设备备用译文'))
    await utimes(sourcePath, new Date(revisionMs), new Date(revisionMs))
    await utimes(translationPath, new Date(revisionMs + 1_000), new Date(revisionMs + 1_000))
    await utimes(translationAlternatePath, new Date(revisionMs + 2_000), new Date(revisionMs + 2_000))

    await page.reload()
    await openEditor()
    await page.locator('[data-testid="editing-caption-reload-conflict"]').waitFor({ timeout: 10_000 })
    await candidateAuditDetails.waitFor({ timeout: 10_000 })
    const candidateAuditReloadedOuterOpen = await candidateAuditDetails.evaluate((details) => (details as HTMLDetailsElement).open)
    const candidateAuditReloadedGroupOpen = await candidateAuditGroups.evaluateAll((groups) => groups.map((group) => (group as HTMLDetailsElement).open))
    const sidecarDetails = page.locator('[data-testid="editing-caption-reload-sidecar-paths"]')
    await sidecarDetails.locator('summary').click()
    const sidecarSource = sidecarDetails.locator('.editing-caption-reload-sidecar-source').first()
    const selectedSourcePath = await sidecarSource.locator('small[data-testid^="editing-caption-reload-sidecar-selected-"][data-testid$="-source"] code').textContent()
    const selectedTranslationPath = await sidecarSource.locator('small[data-testid^="editing-caption-reload-sidecar-selected-"][data-testid$="-translation"] code').textContent()
    const candidateRows = await sidecarSource.locator('small').count()
    const conflictRows = await page.locator('[data-testid="editing-caption-reload-conflict"] .editing-caption-reload-row').count()
    const ambiguity = page.locator('[data-testid^="editing-caption-reload-sidecar-ambiguity-"]').first()
    const ambiguityCount = await page.locator('[data-testid^="editing-caption-reload-sidecar-ambiguity-"]').count()
    const ambiguityText = await ambiguity.textContent()
    const equivalentCount = await page.locator('[data-testid^="editing-caption-reload-sidecar-equivalent-"]').count()
    const equivalentText = await page.locator('[data-testid^="editing-caption-reload-sidecar-equivalent-"]').first().textContent()
    const candidateAuditStatus = await page.locator('[data-testid="editing-project-status-message"]').textContent()
    if (await candidateAuditDetails.count() !== 1) throw new Error('Candidate audit details disclosure was not rendered')
    const candidateAuditDetailsSummary = await candidateAuditDetails.locator(':scope > summary').textContent()
    if (!(await candidateAuditDetails.evaluate((details) => (details as HTMLDetailsElement).open))) await candidateAuditDetails.locator(':scope > summary').click()
    const candidateAuditDetailsText = await candidateAuditDetails.textContent()
    const candidateAuditGroupCount = await candidateAuditGroups.count()
    const candidateAuditGroupLabels = await candidateAuditGroups.locator(':scope > summary').allTextContents()
    const candidateAuditFirstGroup = candidateAuditGroups.nth(0)
    const candidateAuditSecondGroup = candidateAuditGroups.nth(1)
    if (await candidateAuditFirstGroup.evaluate((group) => (group as HTMLDetailsElement).open)) await candidateAuditFirstGroup.locator(':scope > summary').click()
    if (await candidateAuditSecondGroup.evaluate((group) => (group as HTMLDetailsElement).open)) await candidateAuditSecondGroup.locator(':scope > summary').click()
    const candidateAuditGroupOpenBefore = await candidateAuditGroups.evaluateAll((groups) => groups.map((group) => (group as HTMLDetailsElement).open))
    await candidateAuditFirstGroup.locator(':scope > summary').click()
    const candidateAuditFirstGroupOpen = await candidateAuditFirstGroup.evaluate((group) => (group as HTMLDetailsElement).open)
    const candidateAuditFirstGroupDetailsVisible = await candidateAuditFirstGroup.locator('.editing-project-status-details-list').isVisible()
    await candidateAuditSecondGroup.locator(':scope > summary').press('Enter')
    const candidateAuditSecondGroupOpen = await candidateAuditSecondGroup.evaluate((group) => (group as HTMLDetailsElement).open)
    await candidateAuditFirstGroup.locator(':scope > summary').click()
    const candidateAuditFirstGroupClosed = !(await candidateAuditFirstGroup.evaluate((group) => (group as HTMLDetailsElement).open))
    const candidateAuditSecondGroupStillOpen = await candidateAuditSecondGroup.evaluate((group) => (group as HTMLDetailsElement).open)
    const candidateAuditScreenshotPath = join(smokeHomeDirectory, 'aivplayer-smoke-sidecar-paths-groups.png')
    await page.screenshot({ path: candidateAuditScreenshotPath, fullPage: false })
    await candidateAuditSecondGroup.locator(':scope > summary').press('Enter')
    const alternateTranslationButton = sidecarSource.locator('button[data-testid^="editing-caption-reload-select-sidecar-"][data-testid$="-translation-1"]')
    if (await alternateTranslationButton.count() !== 1) throw new Error('Alternate translation candidate button was not rendered')
    const alternateTranslationCandidatePath = await alternateTranslationButton.locator('code').textContent()
    if (!alternateTranslationCandidatePath) throw new Error('Alternate translation candidate path was empty')
    await alternateTranslationButton.click()
    await page.locator('[data-testid="editing-caption-reload-conflict"]').waitFor({ state: 'detached', timeout: 10_000 })
    await page.waitForFunction((expectedPath) => {
      const entries = Object.values(JSON.parse(localStorage.getItem('aivplayer.editing-projects.v1') ?? '{}') as Record<string, { captionSourcePaths?: Record<string, { translation: string | null }> }>)
      return Object.values(entries[0]?.captionSourcePaths ?? {})[0]?.translation === expectedPath
    }, alternateTranslationCandidatePath, { timeout: 10_000 })
    const selectedProject = await readStoredProject()
    const sourceId = Object.keys(baseline.captionSourceRevisions)[0] ?? ''
    const selectedCandidatePath = selectedProject?.captionSourcePaths?.[sourceId]?.translation ?? null
    const selectedCandidateText = selectedProject?.captions.find((caption) => caption.text.includes('更新跨设备备用译文'))?.text ?? null
    const selectedCandidateRevision = selectedProject?.captionSourceRevisions?.[sourceId]?.translation ?? null
    await page.locator('[data-testid="editing-undo"]').click()
    await page.waitForFunction((expectedText) => {
      const entries = Object.values(JSON.parse(localStorage.getItem('aivplayer.editing-projects.v1') ?? '{}') as Record<string, { captions: Array<{ text: string }> }>)
      return entries[0]?.captions.some((caption) => caption.text.includes(expectedText)) ?? false
    }, '初始跨设备译文', { timeout: 10_000 })
    const undoneProject = await readStoredProject()
    const undoPreferredPath = undoneProject?.captionSourcePaths?.[sourceId]?.translation ?? null
    const undoCaptionText = undoneProject?.captions.find((caption) => caption.kind === 'translation')?.text ?? null
    await page.locator('[data-testid="editing-redo"]').click()
    await page.waitForFunction((expectedPath) => {
      const entries = Object.values(JSON.parse(localStorage.getItem('aivplayer.editing-projects.v1') ?? '{}') as Record<string, { captionSourcePaths?: Record<string, { translation: string | null }> }>)
      return Object.values(entries[0]?.captionSourcePaths ?? {})[0]?.translation === expectedPath
    }, alternateTranslationCandidatePath, { timeout: 10_000 })
    const redoneProject = await readStoredProject()
    const redoPreferredPath = redoneProject?.captionSourcePaths?.[sourceId]?.translation ?? null
    const redoCaptionText = redoneProject?.captions.find((caption) => caption.text.includes('更新跨设备备用译文'))?.text ?? null
    await writeFile(translationAlternatePath, makeVtt('再次更新跨设备备用译文'))
    await utimes(translationAlternatePath, new Date(revisionMs + 3_000), new Date(revisionMs + 3_000))
    await page.reload()
    await openEditor()
    await page.locator('[data-testid="editing-caption-reload-conflict"]').waitFor({ timeout: 10_000 })
    const clearSidecarDetails = page.locator('[data-testid="editing-caption-reload-sidecar-paths"]')
    await clearSidecarDetails.locator('summary').click()
    const clearSidecarSource = clearSidecarDetails.locator('.editing-caption-reload-sidecar-source').first()
    const clearCandidateButton = clearSidecarSource.locator('button[data-testid^="editing-caption-reload-clear-sidecar-"][data-testid$="-translation"]')
    if (await clearCandidateButton.count() !== 1) throw new Error('Clear automatic translation candidate button was not rendered')
    await clearCandidateButton.click()
    await page.locator('[data-testid="editing-caption-reload-conflict"]').waitFor({ state: 'detached', timeout: 10_000 })
    await page.waitForFunction(() => {
      const entries = Object.values(JSON.parse(localStorage.getItem('aivplayer.editing-projects.v1') ?? '{}') as Record<string, { captionSourcePaths?: Record<string, { translation: string | null }> }>)
      return Object.values(entries[0]?.captionSourcePaths ?? {})[0]?.translation === null
    }, undefined, { timeout: 10_000 })
    const clearedProject = await readStoredProject()
    const clearedPreferredPath = clearedProject?.captionSourcePaths?.[sourceId]?.translation ?? null
    const clearedCaptionText = clearedProject?.captions.find((caption) => caption.kind === 'translation')?.text ?? null
    await page.locator('[data-testid="editing-undo"]').click()
    await page.waitForFunction((expectedPath) => {
      const entries = Object.values(JSON.parse(localStorage.getItem('aivplayer.editing-projects.v1') ?? '{}') as Record<string, { captionSourcePaths?: Record<string, { translation: string | null }> }>)
      return Object.values(entries[0]?.captionSourcePaths ?? {})[0]?.translation === expectedPath
    }, alternateTranslationCandidatePath, { timeout: 10_000 })
    const clearUndoneProject = await readStoredProject()
    const clearUndoPreferredPath = clearUndoneProject?.captionSourcePaths?.[sourceId]?.translation ?? null
    await page.locator('[data-testid="editing-redo"]').click()
    await page.waitForFunction(() => {
      const entries = Object.values(JSON.parse(localStorage.getItem('aivplayer.editing-projects.v1') ?? '{}') as Record<string, { captionSourcePaths?: Record<string, { translation: string | null }> }>)
      return Object.values(entries[0]?.captionSourcePaths ?? {})[0]?.translation === null
    }, undefined, { timeout: 10_000 })
    const clearRedoneProject = await readStoredProject()
    const clearRedoPreferredPath = clearRedoneProject?.captionSourcePaths?.[sourceId]?.translation ?? null
    const screenshotPath = join(smokeHomeDirectory, 'aivplayer-smoke-sidecar-paths.png')
    await page.screenshot({ path: screenshotPath, fullPage: false })
    const result = {
      baselineSourceRevision: baseline.captionSourceRevisions[Object.keys(baseline.captionSourceRevisions)[0] ?? '']?.source ?? null,
      selectedSourcePath,
      selectedTranslationPath,
      expectedSourcePath: sourcePath,
      expectedTranslationPath: translationPath,
      candidateRows,
      conflictRows,
      ambiguityCount,
      ambiguityText,
      equivalentCount,
      equivalentText,
      candidateAuditStatus,
      candidateAuditDetailsSummary,
      candidateAuditDetailsText,
      candidateAuditSessionInitialOuterOpen,
      candidateAuditSessionInitialGroupOpen,
      candidateAuditSessionRefreshedOuterOpen,
      candidateAuditSessionRefreshedGroupOpen,
      candidateAuditSessionStorageValue,
      candidateAuditSessionScreenshotPath,
      candidateAuditClearedDetailsCount,
      candidateAuditClearedStatus,
      candidateAuditRestoredDetailsCount,
      candidateAuditResetOuterOpen,
      candidateAuditResetGroupOpen,
      candidateAuditResetPreference,
      candidateAuditGlobalResetDialogShown,
      candidateAuditGlobalResetAcceptedDialog,
      candidateAuditGlobalResetOuterOpenAfterCancel,
      candidateAuditGlobalResetGroupOpenAfterCancel,
      candidateAuditGlobalResetCancelled,
      candidateAuditGlobalResetOuterOpen,
      candidateAuditGlobalResetGroupOpen,
      candidateAuditGlobalResetPreference,
      candidateAuditGlobalResetScreenshotPath,
      candidateAuditPrunedPreference,
      candidateAuditRestartedOuterOpen,
      candidateAuditRestartedGroupOpen,
      candidateAuditRestartedPreference,
      candidateAuditRestartScreenshotPath,
      candidateAuditReloadedOuterOpen,
      candidateAuditReloadedGroupOpen,
      candidateAuditGroupCount,
      candidateAuditGroupLabels,
      candidateAuditGroupOpenBefore,
      candidateAuditFirstGroupOpen,
      candidateAuditFirstGroupDetailsVisible,
      candidateAuditSecondGroupOpen,
      candidateAuditFirstGroupClosed,
      candidateAuditSecondGroupStillOpen,
      candidateAuditScreenshotPath,
      selectedCandidatePath,
      alternateTranslationCandidatePath,
      selectedCandidateText,
      selectedCandidateRevision,
      undoPreferredPath,
      undoCaptionText,
      redoPreferredPath,
      redoCaptionText,
      clearedPreferredPath,
      clearedCaptionText,
      clearUndoPreferredPath,
      clearRedoPreferredPath,
      screenshotPath,
      consoleErrors
    }
    console.log('AIVPlayer Smoke Editing Sidecar Paths')
    console.log(JSON.stringify(result))
    if (result.selectedSourcePath?.toLowerCase() !== sourcePath.toLowerCase() || result.selectedTranslationPath?.toLowerCase() !== translationPath.toLowerCase() || result.candidateRows < 6 || result.conflictRows !== 2 || result.ambiguityCount !== 1 || !result.ambiguityText?.includes('2') || result.equivalentCount < 1 || !result.equivalentText?.includes('内容相同') || result.candidateAuditStatus?.includes(smokeDirectory) || !result.candidateAuditDetailsSummary?.includes('查看完整候选路径') || !result.candidateAuditSessionInitialOuterOpen || !result.candidateAuditSessionInitialGroupOpen || !result.candidateAuditSessionRefreshedOuterOpen || !result.candidateAuditSessionRefreshedGroupOpen || result.candidateAuditSessionStorageValue !== null || result.candidateAuditClearedDetailsCount !== 0 || !result.candidateAuditClearedStatus || result.candidateAuditClearedStatus.includes(smokeDirectory) || result.candidateAuditRestoredDetailsCount !== 1 || result.candidateAuditResetOuterOpen || result.candidateAuditResetGroupOpen || !result.candidateAuditResetPreference.currentProjectPresent || result.candidateAuditResetPreference.currentDetailsOpen || result.candidateAuditResetPreference.currentOpenGroupCount !== 0 || !result.candidateAuditResetPreference.otherProjectPresent || !result.candidateAuditResetPreference.otherDetailsOpen || result.candidateAuditResetPreference.otherOpenGroupCount !== 1 || result.candidateAuditResetPreference.containsSmokePath || !result.candidateAuditGlobalResetDialogShown.includes('候选详情') || !result.candidateAuditGlobalResetAcceptedDialog.includes('候选详情') || !result.candidateAuditGlobalResetOuterOpenAfterCancel || !result.candidateAuditGlobalResetGroupOpenAfterCancel || !result.candidateAuditGlobalResetCancelled || result.candidateAuditGlobalResetOuterOpen || result.candidateAuditGlobalResetGroupOpen || !result.candidateAuditGlobalResetPreference.currentProjectPresent || result.candidateAuditGlobalResetPreference.currentDetailsOpen || result.candidateAuditGlobalResetPreference.currentOpenGroupCount !== 0 || result.candidateAuditGlobalResetPreference.otherProjectPresent || result.candidateAuditGlobalResetPreference.remainingProjectCount !== 1 || result.candidateAuditGlobalResetPreference.containsSmokePath || result.candidateAuditPrunedPreference.staleProjectPresent || !result.candidateAuditPrunedPreference.currentProjectPresent || result.candidateAuditPrunedPreference.containsSmokePath || !result.candidateAuditRestartedOuterOpen || !result.candidateAuditRestartedGroupOpen || result.candidateAuditRestartedPreference.schemaVersion !== 1 || result.candidateAuditRestartedPreference.detailsOpen !== true || result.candidateAuditRestartedPreference.openGroupCount !== 1 || result.candidateAuditRestartedPreference.containsSmokePath || !result.candidateAuditReloadedOuterOpen || !result.candidateAuditReloadedGroupOpen[0] || result.candidateAuditReloadedGroupOpen[1] || result.candidateAuditGroupCount !== 2 || result.candidateAuditGroupOpenBefore.some(Boolean) || !result.candidateAuditGroupLabels.some((label) => label.includes('原文')) || !result.candidateAuditGroupLabels.some((label) => label.includes('译文')) || !result.candidateAuditFirstGroupOpen || !result.candidateAuditFirstGroupDetailsVisible || !result.candidateAuditSecondGroupOpen || !result.candidateAuditFirstGroupClosed || !result.candidateAuditSecondGroupStillOpen || !result.candidateAuditDetailsText?.includes('内容相同') || !result.candidateAuditDetailsText?.includes('内容不同') || !result.candidateAuditDetailsText?.includes(smokeDirectory) || result.selectedCandidatePath?.toLowerCase() !== result.alternateTranslationCandidatePath.toLowerCase() || result.selectedCandidateText !== '更新跨设备备用译文' || result.selectedCandidateRevision === null || result.undoPreferredPath?.toLowerCase() === result.alternateTranslationCandidatePath.toLowerCase() || result.undoCaptionText !== '初始跨设备译文' || result.redoPreferredPath?.toLowerCase() !== result.alternateTranslationCandidatePath.toLowerCase() || result.redoCaptionText !== '更新跨设备备用译文' || result.clearedPreferredPath !== null || result.clearedCaptionText !== '更新跨设备译文' || result.clearUndoPreferredPath?.toLowerCase() !== result.alternateTranslationCandidatePath.toLowerCase() || result.clearRedoPreferredPath !== null || result.consoleErrors.length > 0) process.exitCode = 1
  } finally {
    await app.close()
  }
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
