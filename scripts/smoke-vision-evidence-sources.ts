import { appendFile, mkdir, mkdtemp, rm, stat, unlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { connect } from '@lancedb/lancedb'
import { _electron as electron, type ElectronApplication, type Page } from 'playwright'

const mediaPath = process.argv[2] ?? '/Users/ponponon/Music/aivplayer_test_video_1min.mp4'

type FixtureSource = {
  fileName: string
  videoPath: string
  sourceFingerprint: string
  derivedTypes: string[]
}

function sourceFingerprint(videoPath: string, sizeBytes: number, mtimeMs: number): string {
  return `${videoPath}:${sizeBytes}:${mtimeMs}`
}

async function createEvidenceTable(userDataDirectory: string, sources: FixtureSource[]): Promise<void> {
  const databaseDirectory = join(userDataDirectory, 'library', 'vision', 'lancedb')
  await mkdir(databaseDirectory, { recursive: true })
  const database = await connect(databaseDirectory)
  const rows = sources.flatMap((source, sourceIndex) => [
    ...source.derivedTypes.map((evidenceType, typeIndex) => ({
      id: `${source.fileName}-${evidenceType}`,
      source_id: `source-${sourceIndex}`,
      video_path: source.videoPath,
      file_name: source.fileName,
      evidence_type: evidenceType,
      start_seconds: typeIndex,
      end_seconds: typeIndex + 1,
      text: `${evidenceType} fixture`,
      frame_id: '',
      thumbnail_path: '',
      confidence: 0,
      box_xmin: 0,
      box_ymin: 0,
      box_xmax: 0,
      box_ymax: 0,
      source_fingerprint: source.sourceFingerprint,
      model_id: 'smoke-model',
      model_variant: 'smoke-variant',
      generated_at: 1_000 + sourceIndex * 10 + typeIndex
    })),
    ...(source.fileName === 'current.mp4' ? [{
      id: 'current-visual',
      source_id: `source-${sourceIndex}`,
      video_path: source.videoPath,
      file_name: source.fileName,
      evidence_type: 'visual',
      start_seconds: 0,
      end_seconds: 1,
      text: 'base visual fixture',
      frame_id: 'frame-current',
      thumbnail_path: '',
      confidence: 0,
      box_xmin: 0,
      box_ymin: 0,
      box_xmax: 0,
      box_ymax: 0,
      source_fingerprint: source.sourceFingerprint,
      model_id: 'smoke-model',
      model_variant: 'smoke-variant',
      generated_at: 999
    }] : [])
  ])
  await database.createTable('video_evidence', rows)
}

async function seedEvidence(userDataDirectory: string): Promise<{ sourceDirectory: string; sources: FixtureSource[] }> {
  const sourceDirectory = await mkdtemp(join(tmpdir(), 'aivplayer-smoke-vision-evidence-sources-'))
  const paths = {
    current: join(sourceDirectory, 'current.mp4'),
    changed: join(sourceDirectory, 'changed.mp4'),
    missing: join(sourceDirectory, 'missing.mp4')
  }
  await Promise.all(Object.values(paths).map((path) => writeFile(path, `${path}\n`)))
  const initialStats = await Promise.all(Object.values(paths).map((path) => stat(path)))
  const sources: FixtureSource[] = [
    { fileName: 'current.mp4', videoPath: paths.current, sourceFingerprint: sourceFingerprint(paths.current, initialStats[0].size, initialStats[0].mtimeMs), derivedTypes: ['ocr', 'scene'] },
    { fileName: 'changed.mp4', videoPath: paths.changed, sourceFingerprint: sourceFingerprint(paths.changed, initialStats[1].size, initialStats[1].mtimeMs), derivedTypes: ['entity', 'object'] },
    { fileName: 'missing.mp4', videoPath: paths.missing, sourceFingerprint: sourceFingerprint(paths.missing, initialStats[2].size, initialStats[2].mtimeMs), derivedTypes: ['speaker'] }
  ]
  await createEvidenceTable(userDataDirectory, sources)
  await appendFile(paths.changed, '-changed')
  await unlink(paths.missing)
  return { sourceDirectory, sources }
}

async function launchPlayer(userDataDirectory: string): Promise<{ app: ElectronApplication; page: Page; errors: string[] }> {
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

async function openEvidenceSources(page: Page): Promise<ReturnType<Page['locator']>> {
  await page.getByRole('tab', { name: '影视库搜索' }).click()
  const panel = page.locator('[data-testid="vision-evidence-sources"]')
  await panel.waitFor({ timeout: 10_000 })
  await page.waitForFunction(() => document.querySelectorAll('[data-testid="vision-evidence-sources"] .vision-evidence-source').length === 3, undefined, { timeout: 15_000 })
  return panel
}

async function countEvidenceRows(userDataDirectory: string, videoPath: string): Promise<Record<string, number>> {
  const database = await connect(join(userDataDirectory, 'library', 'vision', 'lancedb'))
  const table = await database.openTable('video_evidence')
  const rows = await table.query().toArray() as unknown as Array<{ video_path: string; evidence_type: string }>
  return rows.filter((row) => row.video_path === videoPath).reduce<Record<string, number>>((counts, row) => {
    counts[row.evidence_type] = (counts[row.evidence_type] ?? 0) + 1
    return counts
  }, {})
}

async function waitForSourceCount(panel: ReturnType<Page['locator']>, count: number): Promise<void> {
  await panel.locator('.vision-evidence-source').nth(Math.max(0, count - 1)).waitFor({ state: count > 0 ? 'visible' : 'hidden', timeout: 5_000 }).catch(() => undefined)
  await panel.page().waitForFunction((expected) => document.querySelectorAll('[data-testid="vision-evidence-sources"] .vision-evidence-source').length === expected, count, { timeout: 10_000 })
}

async function runSmoke(): Promise<void> {
  const userDataDirectory = await mkdtemp(join(tmpdir(), 'aivplayer-smoke-vision-evidence-sources-user-data-'))
  let sourceDirectory = ''
  let app: ElectronApplication | null = null

  try {
    const seeded = await seedEvidence(userDataDirectory)
    sourceDirectory = seeded.sourceDirectory
    const session = await launchPlayer(userDataDirectory)
    app = session.app
    const panel = await openEvidenceSources(session.page)
    if (await panel.locator('[data-testid="vision-evidence-audit-status-current"]').count() !== 1 || await panel.locator('[data-testid="vision-evidence-audit-status-changed"]').count() !== 1 || await panel.locator('[data-testid="vision-evidence-audit-status-missing"]').count() !== 1) {
      throw new Error(`证据来源审计状态不完整：${await panel.locator('.vision-evidence-source').allTextContents()}`)
    }

    await panel.getByTestId('vision-evidence-audit-filter').selectOption('missing')
    await waitForSourceCount(panel, 1)
    if (await panel.locator('.vision-evidence-source strong').textContent() !== 'missing.mp4') throw new Error('missing 状态筛选未命中缺失来源')
    await panel.getByTestId('vision-evidence-audit-filter').selectOption('all')
    await waitForSourceCount(panel, 3)

    const currentRow = panel.locator('.vision-evidence-source').filter({ hasText: 'current.mp4' })
    await currentRow.getByRole('checkbox', { name: 'current.mp4', exact: true }).check()
    await panel.locator('[data-evidence-testid="vision-evidence-clear-selected"]').click()
    await session.page.waitForFunction(() => ![...document.querySelectorAll('.vision-evidence-source')].some((row) => row.textContent?.includes('current.mp4')), undefined, { timeout: 10_000 })
    const currentRows = await countEvidenceRows(userDataDirectory, seeded.sources[0].videoPath)
    if (currentRows.visual !== 1 || currentRows.ocr || currentRows.scene) throw new Error(`清理派生证据时破坏基础 visual 或未清干净：${JSON.stringify(currentRows)}`)

    const changedRow = panel.locator('.vision-evidence-source').filter({ hasText: 'changed.mp4' })
    await changedRow.getByRole('checkbox', { name: 'changed.mp4', exact: true }).check()
    await panel.locator('[data-evidence-testid="vision-evidence-clear-selected"]').click()
    await session.page.waitForFunction(() => ![...document.querySelectorAll('.vision-evidence-source')].some((row) => row.textContent?.includes('changed.mp4')), undefined, { timeout: 10_000 })
    const changedRows = await countEvidenceRows(userDataDirectory, seeded.sources[1].videoPath)
    if (Object.keys(changedRows).length !== 0) throw new Error(`changed 来源的派生证据未清理：${JSON.stringify(changedRows)}`)
    if (session.errors.length > 0) throw new Error(`Renderer errors during vision evidence sources smoke:\n${session.errors.join('\n')}`)
    console.log(`AIVPlayer Smoke Vision Evidence Sources passed: ${JSON.stringify({ auditStatuses: ['current', 'changed', 'missing'], missingFilter: true, derivedCleared: true, baseVisualPreserved: true })}`)
  } finally {
    if (app) await app.close().catch(() => undefined)
    if (sourceDirectory) await rm(sourceDirectory, { recursive: true, force: true }).catch(() => undefined)
    await rm(userDataDirectory, { recursive: true, force: true }).catch(() => undefined)
  }
}

runSmoke().catch((error) => {
  console.error(error instanceof Error ? error.stack ?? error.message : String(error))
  process.exitCode = 1
})
