import { mkdtemp, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { _electron as electron, type ElectronApplication, type Page } from 'playwright'

const mediaPath = process.argv[2] ?? '/Users/ponponon/Music/aivplayer_test_video_1min.mp4'
const screenshotPath = process.env.AIVPLAYER_SMOKE_SCREENSHOT_PATH

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
  await page.locator('#root').waitFor({ timeout: 10_000 })
  return { app, page, errors }
}

async function openVisionPanel(page: Page): Promise<void> {
  await page.getByRole('tab', { name: '影视库搜索' }).click()
  await page.locator('.vision-panel').waitFor({ timeout: 10_000 })
}

async function runSmoke(): Promise<void> {
  const userDataDirectory = await mkdtemp(join(tmpdir(), 'aivplayer-smoke-vision-clip-collection-filter-'))
  const prefix = `集合筛选 Smoke ${Date.now()}`
  const titles = [`海边采访 ${prefix}`, `室内素材 ${prefix}`, `海边精选 ${prefix}`]
  let app: ElectronApplication | null = null

  try {
    const session = await launchPlayer(userDataDirectory)
    app = session.app
    const page = session.page
    await openVisionPanel(page)

    const originals = await page.evaluate(({ nextTitles }) => Promise.all(nextTitles.map((title, index) => window.aiv.saveVisionClipCollection({
      title,
      tags: index === 0 ? ['采访', '专题'] : index === 1 ? ['室内'] : ['海边', '精选'],
      sortMode: 'source-time',
      selections: [{
        sourceId: 'source-collection-filter-smoke',
        videoPath: '/tmp/aivplayer-collection-filter-smoke-missing.mp4',
        fileName: 'collection-filter-smoke-missing.mp4',
        fingerprint: 'collection-filter-smoke-fingerprint',
        durationSeconds: 30,
        startSeconds: index + 1,
        endSeconds: index + 7,
        evidenceIds: [`collection-filter-evidence-${index + 1}`],
        text: `集合筛选验证 ${index + 1}`,
        evidenceTypes: ['subtitle']
      }]
    }))), { nextTitles: titles })
    const hierarchyResult = await page.evaluate(() => window.aiv.updateVisionClipCollectionTagMetadata({ tag: '海边', parentTag: '采访' }))
    if (!hierarchyResult.success) throw new Error(`Unable to prepare hierarchical tag filter: ${hierarchyResult.message}`)

    await page.reload({ waitUntil: 'domcontentloaded' })
    await openVisionPanel(page)
    const queryInput = page.getByRole('textbox', { name: '按名称或标签筛选', exact: true })
    const tagSelect = page.getByRole('listbox', { name: '按标签筛选（可多选）', exact: true })
    await queryInput.waitFor({ timeout: 10_000 })
    await tagSelect.waitFor({ timeout: 10_000 })
    if (await page.locator('.vision-collection').count() !== 3) throw new Error('Collection filter smoke should start with three collections')

    await queryInput.fill('海边')
    await page.getByRole('status').filter({ hasText: '显示 2 / 3 个集合' }).waitFor({ timeout: 10_000 })
    if (await page.locator('.vision-collection').count() !== 2 || await page.getByText(titles[1], { exact: true }).count() !== 0) {
      throw new Error('Collection name/tag query should match exactly two coastal collections')
    }

    await tagSelect.selectOption({ label: '采访' })
    await page.getByRole('status').filter({ hasText: '显示 2 / 3 个集合' }).waitFor({ timeout: 10_000 })
    if (await page.locator('.vision-collection').count() !== 2 || await page.getByText(titles[0], { exact: true }).count() !== 1 || await page.getByText(titles[2], { exact: true }).count() !== 1) {
      throw new Error('Collection query and hierarchical tag filter should combine with AND semantics')
    }

    await page.getByRole('button', { name: '清除筛选', exact: true }).click()
    await tagSelect.selectOption([{ label: '采访' }, { label: '精选' }])
    await page.getByRole('status').filter({ hasText: '显示 2 / 3 个集合' }).waitFor({ timeout: 10_000 })
    if (await page.locator('.vision-collection').count() !== 2) throw new Error('Any tag mode should match collections for either selected tag')
    await page.getByRole('button', { name: '移除标签筛选: 采访', exact: true }).click()
    await page.getByRole('status').filter({ hasText: '显示 1 / 3 个集合' }).waitFor({ timeout: 10_000 })
    if (await page.getByRole('button', { name: '移除标签筛选: 采访', exact: true }).count() !== 0 || await page.locator('.vision-collection').count() !== 1) throw new Error('Removing one selected tag should keep the other tag filter active')
    await tagSelect.selectOption([{ label: '采访' }, { label: '精选' }])
    await page.getByRole('status').filter({ hasText: '显示 2 / 3 个集合' }).waitFor({ timeout: 10_000 })
    const tagMode = page.getByRole('combobox', { name: '标签组合方式', exact: true })
    await tagMode.selectOption('all')
    await page.getByRole('status').filter({ hasText: '显示 1 / 3 个集合' }).waitFor({ timeout: 10_000 })
    if (await page.locator('.vision-collection').count() !== 1 || await page.getByText(titles[2], { exact: true }).count() !== 1) throw new Error('All tag mode should require every selected tag, including hierarchy matches')

    await page.getByRole('button', { name: '清除筛选', exact: true }).click()
    await page.getByRole('status').filter({ hasText: '显示 3 / 3 个集合' }).waitFor({ timeout: 10_000 })
    if (await page.locator('.vision-collection').count() !== 3) throw new Error('Clearing collection filters should restore all collections')

    const selectedCollectionSummary = page.locator('.vision-collection-batch-tags-actions strong')
    await page.getByRole('button', { name: '全选集合', exact: true }).click()
    await selectedCollectionSummary.filter({ hasText: '已选择 3 个集合' }).waitFor({ timeout: 10_000 })
    await queryInput.fill('海边')
    await tagSelect.selectOption({ label: '采访' })
    await page.getByRole('status').filter({ hasText: '显示 2 / 3 个集合' }).waitFor({ timeout: 10_000 })
    await page.getByRole('button', { name: '清空可见选择', exact: true }).click()
    await selectedCollectionSummary.filter({ hasText: '已选择 1 个集合' }).waitFor({ timeout: 10_000 })
    await page.getByRole('button', { name: '全选可见集合', exact: true }).click()
    await selectedCollectionSummary.filter({ hasText: '已选择 3 个集合' }).waitFor({ timeout: 10_000 })
    await page.getByRole('button', { name: '清除筛选', exact: true }).click()
    await selectedCollectionSummary.filter({ hasText: '已选择 3 个集合' }).waitFor({ timeout: 10_000 })

    await queryInput.fill('不存在的集合')
    await page.getByText('没有符合筛选条件的选段集合。', { exact: true }).waitFor({ timeout: 10_000 })
    if (await page.locator('.vision-collection').count() !== 0) throw new Error('Non-matching collection filter should hide every collection row')
    await page.getByRole('button', { name: '清除筛选', exact: true }).click()

    const persisted = await page.evaluate(() => window.aiv.listVisionClipCollections())
    const dataUnchanged = originals.length === persisted.length && originals.every((original) => {
      const current = persisted.find((collection) => collection.id === original.id)
      return current?.title === original.title && JSON.stringify(current?.tags) === JSON.stringify(original.tags) && current?.selections[0]?.evidenceIds[0] === original.selections[0]?.evidenceIds[0]
    })
    if (!dataUnchanged) throw new Error(`Collection filter should not mutate saved data: ${JSON.stringify(persisted)}`)

    await queryInput.fill('海边')
    await tagSelect.selectOption([{ label: '采访' }, { label: '精选' }])
    const persistedTagMode = page.getByRole('combobox', { name: '标签组合方式', exact: true })
    await persistedTagMode.selectOption('all')
    await page.getByRole('status').filter({ hasText: '显示 1 / 3 个集合' }).waitFor({ timeout: 10_000 })
    await page.getByRole('group', { name: '已选标签', exact: true }).waitFor({ timeout: 10_000 })
    if (await page.getByRole('button', { name: '移除标签筛选: 采访', exact: true }).count() !== 1 || await page.getByRole('button', { name: '移除标签筛选: 精选', exact: true }).count() !== 1) {
      throw new Error('Final screenshot state should expose both selected tag summary chips')
    }
    const storedFilterPreferences = await page.evaluate(() => localStorage.getItem('aivplayer.vision-clip-collection-filter.v1'))
    if (!storedFilterPreferences?.includes('"query":"海边"') || !storedFilterPreferences.includes('"tagMode":"all"')) {
      throw new Error(`Collection filter preferences were not persisted: ${storedFilterPreferences ?? 'null'}`)
    }
    if (screenshotPath) {
      await page.locator('.vision-collections').scrollIntoViewIfNeeded()
      await page.screenshot({ path: screenshotPath, fullPage: false })
    }

    await page.reload({ waitUntil: 'domcontentloaded' })
    await openVisionPanel(page)
    const restoredQueryInput = page.getByRole('textbox', { name: '按名称或标签筛选', exact: true })
    const restoredTagSelect = page.getByRole('listbox', { name: '按标签筛选（可多选）', exact: true })
    const restoredTagMode = page.getByRole('combobox', { name: '标签组合方式', exact: true })
    await restoredQueryInput.waitFor({ timeout: 10_000 })
    await page.getByRole('status').filter({ hasText: '显示 1 / 3 个集合' }).waitFor({ timeout: 10_000 })
    const restoredTags = await restoredTagSelect.evaluate((element) => Array.from((element as HTMLSelectElement).selectedOptions).map((option) => option.value))
    const restoredQuery = await restoredQueryInput.inputValue()
    const restoredMode = await restoredTagMode.inputValue()
    const restoredCollectionCount = await page.locator('.vision-collection').count()
    const filterPersisted = restoredQuery === '海边'
      && JSON.stringify(restoredTags) === JSON.stringify(['采访', '精选'])
      && restoredMode === 'all'
      && restoredCollectionCount === 1
    if (!filterPersisted || await page.getByRole('button', { name: '移除标签筛选: 采访', exact: true }).count() !== 1 || await page.getByRole('button', { name: '移除标签筛选: 精选', exact: true }).count() !== 1) {
      throw new Error(`Collection filters should restore after reload: ${JSON.stringify({ query: restoredQuery, tags: restoredTags, tagMode: restoredMode, count: restoredCollectionCount })}`)
    }
    const savedFilterName = `海边精选视图 ${prefix}`
    const savedFilterNameInput = page.getByRole('textbox', { name: '筛选视图名称', exact: true })
    await savedFilterNameInput.fill(savedFilterName)
    await page.getByRole('button', { name: '保存当前筛选', exact: true }).click()
    const savedFilterButton = page.getByRole('button', { name: `应用筛选视图: ${savedFilterName}`, exact: true })
    await savedFilterButton.waitFor({ timeout: 10_000 })
    const storedSavedFilters = await page.evaluate(() => localStorage.getItem('aivplayer.vision-clip-collection-saved-filters.v1'))
    if (!storedSavedFilters?.includes(savedFilterName)) throw new Error(`Saved collection filter was not persisted: ${storedSavedFilters ?? 'null'}`)
    if (screenshotPath) {
      await page.locator('.vision-collection-saved-filters').scrollIntoViewIfNeeded()
      await page.screenshot({ path: screenshotPath, fullPage: false })
    }
    await page.getByRole('button', { name: '清除筛选', exact: true }).click()
    await page.getByRole('status').filter({ hasText: '显示 3 / 3 个集合' }).waitFor({ timeout: 10_000 })
    if (await page.locator('.vision-collection').count() !== 3 || await savedFilterButton.count() !== 1) throw new Error('Clearing restored collection filters should keep the saved view available')
    await savedFilterButton.click()
    await page.getByRole('status').filter({ hasText: '显示 1 / 3 个集合' }).waitFor({ timeout: 10_000 })
    if (await page.locator('.vision-collection').count() !== 1 || await page.getByRole('button', { name: '移除标签筛选: 采访', exact: true }).count() !== 1 || await page.getByRole('button', { name: '移除标签筛选: 精选', exact: true }).count() !== 1) {
      throw new Error('Applying the saved collection filter should restore its query and tag conditions')
    }
    await page.getByRole('button', { name: `删除筛选视图: ${savedFilterName}`, exact: true }).click()
    if (await page.getByRole('button', { name: `应用筛选视图: ${savedFilterName}`, exact: true }).count() !== 0) throw new Error('Deleting a saved collection filter should remove only that view')
    const savedFilterPersisted = await page.evaluate(() => localStorage.getItem('aivplayer.vision-clip-collection-saved-filters.v1'))
    if (savedFilterPersisted?.includes(savedFilterName)) throw new Error(`Deleted collection filter remained in storage: ${savedFilterPersisted}`)
    if (session.errors.length > 0) throw new Error(`Renderer errors during clip collection filter smoke:\n${session.errors.join('\n')}`)
    console.log(`AIVPlayer Smoke Vision Clip Collection Filter passed: ${JSON.stringify({ originalCount: originals.length, queryMatches: 2, tagMatches: 2, hierarchyTagMatches: 2, multiTagAnyMatches: 2, multiTagAllMatches: 1, individualTagRemoval: true, visibleSelectionPreserved: true, emptyState: true, dataUnchanged, filterPersisted, savedFilterRestored: true, savedFilterDeleted: true, screenshotPath: screenshotPath ?? null })}`)
  } finally {
    if (app) await app.close().catch(() => undefined)
    await rm(userDataDirectory, { recursive: true, force: true }).catch(() => undefined)
  }
}

runSmoke().catch((error) => {
  console.error(error instanceof Error ? error.stack ?? error.message : String(error))
  process.exitCode = 1
})
