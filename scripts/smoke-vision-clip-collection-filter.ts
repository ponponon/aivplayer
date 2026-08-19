import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { _electron as electron, type ElectronApplication, type Page } from 'playwright'
import type { VisionEvidenceType } from '../src/shared/vision-types'

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

async function readCollectionTitles(page: Page): Promise<string[]> {
  return page.locator('.vision-collection-title-row strong').allTextContents()
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
        evidenceTypes: ['subtitle'] as VisionEvidenceType[]
      }, ...(index === 2 ? [{
        sourceId: 'source-collection-filter-smoke',
        videoPath: '/tmp/aivplayer-collection-filter-smoke-missing.mp4',
        fileName: 'collection-filter-smoke-missing.mp4',
        fingerprint: 'collection-filter-smoke-fingerprint',
        durationSeconds: 30,
        startSeconds: 10,
        endSeconds: 30,
        evidenceIds: ['collection-filter-evidence-extra'],
        text: '集合筛选验证附加选段',
        evidenceTypes: ['subtitle'] as VisionEvidenceType[]
      }] : [])]
    }))), { nextTitles: titles })
    const hierarchyResult = await page.evaluate(() => window.aiv.updateVisionClipCollectionTagMetadata({ tag: '海边', parentTag: '采访' }))
    if (!hierarchyResult.success) throw new Error(`Unable to prepare hierarchical tag filter: ${hierarchyResult.message}`)

    await page.reload({ waitUntil: 'domcontentloaded' })
    await openVisionPanel(page)
    const queryInput = page.getByRole('textbox', { name: '按名称或标签筛选', exact: true })
    const tagSelect = page.getByRole('listbox', { name: '按标签筛选（可多选）', exact: true })
    const excludedTagSelect = page.getByRole('listbox', { name: '排除标签（可多选）', exact: true })
    const visibilitySelect = page.getByRole('combobox', { name: '集合视图', exact: true })
    const collectionStatusGroup = page.getByRole('group', { name: '集合状态', exact: true })
    await queryInput.waitFor({ timeout: 10_000 })
    await tagSelect.waitFor({ timeout: 10_000 })
    await excludedTagSelect.waitFor({ timeout: 10_000 })
    await visibilitySelect.waitFor({ timeout: 10_000 })
    await collectionStatusGroup.waitFor({ timeout: 10_000 })
    await page.getByRole('button', { name: '集合状态: 全部 3', exact: true }).waitFor({ timeout: 10_000 })
    if (await page.locator('.vision-collection').count() !== 3) throw new Error('Collection filter smoke should start with three collections')
    const collectionListSort = page.getByRole('combobox', { name: '集合排序', exact: true })
    await collectionListSort.waitFor({ timeout: 10_000 })
    await collectionListSort.selectOption('title-asc')
    const titleSortedCollections = await readCollectionTitles(page)
    const expectedTitleOrder = await page.evaluate((items) => [...items].sort((left, right) => left.localeCompare(right, undefined, { sensitivity: 'base' })), titles)
    if (JSON.stringify(titleSortedCollections) !== JSON.stringify(expectedTitleOrder)) throw new Error(`Title collection sort produced an unexpected order: ${JSON.stringify(titleSortedCollections)}`)
    await collectionListSort.selectOption('selection-count-desc')
    const countSortedCollections = await readCollectionTitles(page)
    if (countSortedCollections[0] !== titles[2]) throw new Error(`Selection count collection sort should put the two-selection collection first: ${JSON.stringify(countSortedCollections)}`)
    await collectionListSort.selectOption('duration-desc')
    const durationSortedCollections = await readCollectionTitles(page)
    if (durationSortedCollections[0] !== titles[2]) throw new Error(`Duration collection sort should put the longest collection first: ${JSON.stringify(durationSortedCollections)}`)
    await collectionListSort.selectOption('title-asc')

    await page.getByRole('button', { name: `收藏集合: ${titles[2]}`, exact: true }).click()
    await page.getByRole('button', { name: `取消收藏集合: ${titles[2]}`, exact: true }).waitFor({ timeout: 10_000 })
    const collectionOperationUndoButton = page.getByRole('button', { name: '撤销上次收藏归档操作', exact: true })
    await collectionOperationUndoButton.waitFor({ timeout: 10_000 })
    await collectionOperationUndoButton.click()
    await page.getByRole('button', { name: `收藏集合: ${titles[2]}`, exact: true }).waitFor({ timeout: 10_000 })
    await collectionOperationUndoButton.waitFor({ state: 'hidden', timeout: 10_000 })
    const singleFlagUndoPersisted = await page.evaluate((title) => window.aiv.listVisionClipCollections().then((items) => items.find((item) => item.title === title)?.isFavorite === false), titles[2])
    if (!singleFlagUndoPersisted) throw new Error('Undo should restore the previous single collection favorite state')
    const collectionOperationRedoButton = page.getByRole('button', { name: '重做上次收藏归档操作', exact: true })
    await collectionOperationRedoButton.waitFor({ timeout: 10_000 })
    await collectionOperationRedoButton.click()
    await page.getByRole('button', { name: `取消收藏集合: ${titles[2]}`, exact: true }).waitFor({ timeout: 10_000 })
    await collectionOperationRedoButton.waitFor({ state: 'hidden', timeout: 10_000 })
    const singleFlagRedoPersisted = await page.evaluate((title) => window.aiv.listVisionClipCollections().then((items) => items.find((item) => item.title === title)?.isFavorite === true), titles[2])
    if (!singleFlagRedoPersisted) throw new Error('Redo should restore the changed single collection favorite state')
    await page.getByRole('button', { name: '集合状态: 收藏 1', exact: true }).click()
    await page.getByRole('status').filter({ hasText: '显示 1 / 3 个集合' }).waitFor({ timeout: 10_000 })
    if (await page.locator('.vision-collection').count() !== 1 || await page.getByText(titles[2], { exact: true }).count() !== 1) throw new Error('Favorite status shortcut should filter to the favorited collection')
    await page.getByRole('button', { name: '集合状态: 全部 3', exact: true }).click()
    await visibilitySelect.selectOption('favorites')
    await page.getByRole('status').filter({ hasText: '显示 1 / 3 个集合' }).waitFor({ timeout: 10_000 })
    if (await page.locator('.vision-collection').count() !== 1 || await page.getByText(titles[2], { exact: true }).count() !== 1) throw new Error('Favorites collection view should show only the favorited collection')
    await visibilitySelect.selectOption('all')
    await page.getByRole('button', { name: `归档集合: ${titles[1]}`, exact: true }).click()
    await page.getByRole('button', { name: `取消归档集合: ${titles[1]}`, exact: true }).waitFor({ timeout: 10_000 })
    await page.getByRole('button', { name: '集合状态: 归档 1', exact: true }).click()
    await page.getByRole('status').filter({ hasText: '显示 1 / 3 个集合' }).waitFor({ timeout: 10_000 })
    if (await page.locator('.vision-collection').count() !== 1 || await page.getByText(titles[1], { exact: true }).count() !== 1) throw new Error('Archived status shortcut should filter to the archived collection')
    await page.getByRole('button', { name: '集合状态: 活跃 2', exact: true }).click()
    await page.getByRole('status').filter({ hasText: '显示 2 / 3 个集合' }).waitFor({ timeout: 10_000 })
    if (await page.locator('.vision-collection').count() !== 2 || await page.getByText(titles[1], { exact: true }).count() !== 0) throw new Error('Active status shortcut should hide the archived collection')
    await page.getByRole('button', { name: '集合状态: 全部 3', exact: true }).click()
    await visibilitySelect.selectOption('archived')
    await page.getByRole('status').filter({ hasText: '显示 1 / 3 个集合' }).waitFor({ timeout: 10_000 })
    if (await page.locator('.vision-collection').count() !== 1 || await page.getByText(titles[1], { exact: true }).count() !== 1) throw new Error('Archived collection view should show only the archived collection')
    await visibilitySelect.selectOption('active')
    await page.getByRole('status').filter({ hasText: '显示 2 / 3 个集合' }).waitFor({ timeout: 10_000 })
    if (await page.locator('.vision-collection').count() !== 2 || await page.getByText(titles[1], { exact: true }).count() !== 0) throw new Error('Active collection view should hide archived collections')
    await visibilitySelect.selectOption('all')

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

    await excludedTagSelect.selectOption({ label: '采访' })
    await page.getByRole('status').filter({ hasText: '显示 1 / 3 个集合' }).waitFor({ timeout: 10_000 })
    if (await page.locator('.vision-collection').count() !== 1 || await page.getByText(titles[1], { exact: true }).count() !== 1) throw new Error('Excluding a parent tag should hide the parent and all descendant collections')
    await page.getByRole('button', { name: '清除筛选', exact: true }).click()
    await page.getByRole('status').filter({ hasText: '显示 3 / 3 个集合' }).waitFor({ timeout: 10_000 })

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
    await page.getByRole('button', { name: '收藏集合', exact: true }).click()
    await page.getByRole('button', { name: '取消收藏集合', exact: true }).waitFor({ timeout: 10_000 })
    await collectionOperationUndoButton.waitFor({ timeout: 10_000 })
    await collectionOperationUndoButton.click()
    await page.getByRole('button', { name: '收藏集合', exact: true }).waitFor({ timeout: 10_000 })
    await collectionOperationRedoButton.waitFor({ timeout: 10_000 })
    await collectionOperationRedoButton.click()
    await page.getByRole('button', { name: '取消收藏集合', exact: true }).waitFor({ timeout: 10_000 })
    await collectionOperationRedoButton.waitFor({ state: 'hidden', timeout: 10_000 })
    const batchFlagRedoPersisted = await page.evaluate(({ favoriteTitle, archivedTitle, plainTitle }) => window.aiv.listVisionClipCollections().then((items) => {
      const favorite = items.find((item) => item.title === favoriteTitle)
      const archived = items.find((item) => item.title === archivedTitle)
      const plain = items.find((item) => item.title === plainTitle)
      return favorite?.isFavorite === true && archived?.isFavorite === true && archived?.isArchived === true && plain?.isFavorite === true && plain?.isArchived === false
    }), { favoriteTitle: titles[2], archivedTitle: titles[1], plainTitle: titles[0] })
    if (!batchFlagRedoPersisted) throw new Error('Batch favorite redo should restore all changed favorite states without changing archive state')
    await page.getByRole('button', { name: '取消收藏集合', exact: true }).click()
    await page.getByRole('button', { name: '收藏集合', exact: true }).waitFor({ timeout: 10_000 })
    await page.getByRole('button', { name: `收藏集合: ${titles[2]}`, exact: true }).click()
    await page.getByRole('button', { name: `取消收藏集合: ${titles[2]}`, exact: true }).waitFor({ timeout: 10_000 })
    await page.getByRole('button', { name: '归档集合', exact: true }).click()
    await page.getByRole('button', { name: '取消归档集合', exact: true }).waitFor({ timeout: 10_000 })
    await page.getByRole('button', { name: '取消归档集合', exact: true }).click()
    await page.getByRole('button', { name: '归档集合', exact: true }).waitFor({ timeout: 10_000 })
    await page.getByRole('button', { name: `归档集合: ${titles[1]}`, exact: true }).click()
    await page.getByRole('button', { name: `取消归档集合: ${titles[1]}`, exact: true }).waitFor({ timeout: 10_000 })

    await queryInput.fill('不存在的集合')
    await page.getByText('没有符合筛选条件的选段集合。', { exact: true }).waitFor({ timeout: 10_000 })
    if (await page.locator('.vision-collection').count() !== 0) throw new Error('Non-matching collection filter should hide every collection row')
    await page.getByRole('button', { name: '清除筛选', exact: true }).click()

    const persisted = await page.evaluate(() => window.aiv.listVisionClipCollections())
    const collectionFlagsPersisted = persisted.find((collection) => collection.title === titles[2])?.isFavorite === true
      && persisted.find((collection) => collection.title === titles[1])?.isArchived === true
      && persisted.find((collection) => collection.title === titles[0])?.isFavorite === false
      && persisted.find((collection) => collection.title === titles[0])?.isArchived === false
    const dataUnchanged = originals.length === persisted.length && originals.every((original) => {
      const current = persisted.find((collection) => collection.id === original.id)
      return current?.title === original.title && JSON.stringify(current?.tags) === JSON.stringify(original.tags) && current?.selections[0]?.evidenceIds[0] === original.selections[0]?.evidenceIds[0]
    })
    if (!dataUnchanged) throw new Error(`Collection filter should not mutate saved data: ${JSON.stringify(persisted)}`)
    if (!collectionFlagsPersisted) throw new Error(`Collection favorite/archive flags were not persisted: ${JSON.stringify(persisted)}`)

    await queryInput.fill('海边')
    await tagSelect.selectOption([{ label: '采访' }, { label: '精选' }])
    const persistedTagMode = page.getByRole('combobox', { name: '标签组合方式', exact: true })
    await persistedTagMode.selectOption('all')
    await excludedTagSelect.selectOption({ label: '室内' })
    await visibilitySelect.selectOption('favorites')
    if (!(await collectionListSort.inputValue() === 'title-asc')) throw new Error('Collection list sort should remain independently selectable from filter conditions')
    await page.getByRole('status').filter({ hasText: '显示 1 / 3 个集合' }).waitFor({ timeout: 10_000 })
    await page.getByRole('group', { name: '已选标签', exact: true }).waitFor({ timeout: 10_000 })
    if (await page.getByRole('button', { name: '移除标签筛选: 采访', exact: true }).count() !== 1 || await page.getByRole('button', { name: '移除标签筛选: 精选', exact: true }).count() !== 1) {
      throw new Error('Final screenshot state should expose both selected tag summary chips')
    }
    const storedFilterPreferences = await page.evaluate(() => localStorage.getItem('aivplayer.vision-clip-collection-filter.v1'))
    const storedCollectionOrderPreferences = await page.evaluate(() => localStorage.getItem('aivplayer.vision-clip-collection-order.v1'))
    if (!storedFilterPreferences?.includes('"query":"海边"') || !storedFilterPreferences.includes('"tagMode":"all"') || !storedFilterPreferences.includes('"excludedTags":["室内"]') || !storedFilterPreferences.includes('"visibility":"favorites"') || storedCollectionOrderPreferences !== '{"schemaVersion":1,"sortMode":"title-asc"}') {
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
    const restoredExcludedTagSelect = page.getByRole('listbox', { name: '排除标签（可多选）', exact: true })
    const restoredVisibilitySelect = page.getByRole('combobox', { name: '集合视图', exact: true })
    const restoredTagMode = page.getByRole('combobox', { name: '标签组合方式', exact: true })
    const restoredCollectionListSort = page.getByRole('combobox', { name: '集合排序', exact: true })
    await restoredQueryInput.waitFor({ timeout: 10_000 })
    await page.getByRole('status').filter({ hasText: '显示 1 / 3 个集合' }).waitFor({ timeout: 10_000 })
    const restoredTags = await restoredTagSelect.evaluate((element) => Array.from((element as HTMLSelectElement).selectedOptions).map((option) => option.value))
    const restoredExcludedTags = await restoredExcludedTagSelect.evaluate((element) => Array.from((element as HTMLSelectElement).selectedOptions).map((option) => option.value))
    const restoredQuery = await restoredQueryInput.inputValue()
    const restoredVisibility = await restoredVisibilitySelect.inputValue()
    const restoredMode = await restoredTagMode.inputValue()
    const restoredCollectionListSortMode = await restoredCollectionListSort.inputValue()
    const restoredCollectionCount = await page.locator('.vision-collection').count()
    const restoredCollectionTitles = await readCollectionTitles(page)
    const filterPersisted = restoredQuery === '海边'
      && JSON.stringify(restoredTags) === JSON.stringify(['采访', '精选'])
      && JSON.stringify(restoredExcludedTags) === JSON.stringify(['室内'])
      && restoredVisibility === 'favorites'
      && restoredMode === 'all'
      && restoredCollectionListSortMode === 'title-asc'
      && JSON.stringify(restoredCollectionTitles) === JSON.stringify([titles[2]])
      && restoredCollectionCount === 1
    if (!filterPersisted || await page.getByRole('button', { name: '移除标签筛选: 采访', exact: true }).count() !== 1 || await page.getByRole('button', { name: '移除标签筛选: 精选', exact: true }).count() !== 1 || await page.getByRole('button', { name: '移除排除标签筛选: 室内', exact: true }).count() !== 1) {
      throw new Error(`Collection filters should restore after reload: ${JSON.stringify({ query: restoredQuery, tags: restoredTags, excludedTags: restoredExcludedTags, visibility: restoredVisibility, tagMode: restoredMode, count: restoredCollectionCount })}`)
    }
    const savedFilterName = `海边精选视图 ${prefix}`
    const savedFilterNameInput = page.getByRole('textbox', { name: '筛选视图名称', exact: true })
    await savedFilterNameInput.fill(savedFilterName)
    await page.getByRole('button', { name: '保存当前筛选', exact: true }).click()
    const savedFilterButton = page.getByRole('button', { name: `应用筛选视图: ${savedFilterName}`, exact: true })
    await savedFilterButton.waitFor({ timeout: 10_000 })
    const storedSavedFilters = await page.evaluate(() => localStorage.getItem('aivplayer.vision-clip-collection-saved-filters.v1'))
    if (!storedSavedFilters?.includes(savedFilterName)) throw new Error(`Saved collection filter was not persisted: ${storedSavedFilters ?? 'null'}`)
    await page.evaluate(() => {
      const scope = window as unknown as { __aivplayerFilterExport?: { blob: Blob; fileName: string } }
      const originalCreateObjectURL = URL.createObjectURL.bind(URL)
      const originalAnchorClick = HTMLAnchorElement.prototype.click
      URL.createObjectURL = (blob: Blob) => {
        scope.__aivplayerFilterExport = { blob, fileName: '' }
        return originalCreateObjectURL(blob)
      }
      HTMLAnchorElement.prototype.click = function () {
        if (scope.__aivplayerFilterExport) scope.__aivplayerFilterExport.fileName = this.download
        originalAnchorClick.call(this)
      }
    })
    await page.getByRole('button', { name: '导出筛选视图', exact: true }).click()
    const exportedFilter = await page.evaluate(async () => {
      const scope = window as unknown as { __aivplayerFilterExport?: { blob: Blob; fileName: string } }
      const value = scope.__aivplayerFilterExport
      return value ? { json: await value.blob.text(), fileName: value.fileName } : null
    })
    if (!exportedFilter?.json || !exportedFilter.fileName.endsWith('.json') || !exportedFilter.json.includes('"excludedTags":["室内"]') || !exportedFilter.json.includes('"visibility":"favorites"')) throw new Error(`Exported collection filter did not produce a JSON download with excluded tags and visibility: ${JSON.stringify(exportedFilter)}`)
    const exportedFilterPath = join(userDataDirectory, 'exported-filter-views.json')
    await writeFile(exportedFilterPath, exportedFilter.json, 'utf8')
    const exportedManifest = JSON.parse(exportedFilter.json) as { schemaVersion: number; filters: Array<Record<string, unknown>> }
    const conflictFilterName = `${savedFilterName} 更新`
    const conflictFilterPath = join(userDataDirectory, 'conflicting-filter-views.json')
    await writeFile(conflictFilterPath, JSON.stringify({
      ...exportedManifest,
      filters: exportedManifest.filters.map((filter) => ({ ...filter, name: conflictFilterName }))
    }), 'utf8')
    if (screenshotPath) {
      await page.locator('.vision-collection-saved-filters').scrollIntoViewIfNeeded()
      await page.screenshot({ path: screenshotPath, fullPage: false })
    }
    await page.getByRole('button', { name: '清除筛选', exact: true }).click()
    await page.getByRole('status').filter({ hasText: '显示 3 / 3 个集合' }).waitFor({ timeout: 10_000 })
    if (await page.locator('.vision-collection').count() !== 3 || await savedFilterButton.count() !== 1) throw new Error('Clearing restored collection filters should keep the saved view available')
    await savedFilterButton.click()
    await page.getByRole('status').filter({ hasText: '显示 1 / 3 个集合' }).waitFor({ timeout: 10_000 })
    if (await page.locator('.vision-collection').count() !== 1 || await page.getByRole('button', { name: '移除标签筛选: 采访', exact: true }).count() !== 1 || await page.getByRole('button', { name: '移除标签筛选: 精选', exact: true }).count() !== 1 || await visibilitySelect.inputValue() !== 'favorites') {
      throw new Error('Applying the saved collection filter should restore its query, tag, and visibility conditions')
    }
    await page.getByRole('button', { name: `删除筛选视图: ${savedFilterName}`, exact: true }).click()
    if (await page.getByRole('button', { name: `应用筛选视图: ${savedFilterName}`, exact: true }).count() !== 0) throw new Error('Deleting a saved collection filter should remove only that view')
    const savedFilterPersisted = await page.evaluate(() => localStorage.getItem('aivplayer.vision-clip-collection-saved-filters.v1'))
    if (savedFilterPersisted?.includes(savedFilterName)) throw new Error(`Deleted collection filter remained in storage: ${savedFilterPersisted}`)
    const savedFilterFileInput = page.locator('.vision-collection-saved-filters input[type="file"]')
    await savedFilterFileInput.setInputFiles(exportedFilterPath)
    await page.getByRole('dialog', { name: '导入筛选视图预览', exact: true }).waitFor({ timeout: 10_000 })
    if (await page.getByText('没有需要选择的冲突。', { exact: true }).count() !== 1) throw new Error('New filter view import should show a conflict-free preview')
    await page.getByRole('button', { name: '确认导入', exact: true }).click()
    await savedFilterButton.waitFor({ timeout: 10_000 })
    const importedSavedFilters = await page.evaluate(() => localStorage.getItem('aivplayer.vision-clip-collection-saved-filters.v1'))
    if (!importedSavedFilters?.includes(savedFilterName)) throw new Error(`Imported collection filter did not appear in storage: ${importedSavedFilters ?? 'null'}`)
    await savedFilterFileInput.setInputFiles(conflictFilterPath)
    await page.getByRole('dialog', { name: '导入筛选视图预览', exact: true }).waitFor({ timeout: 10_000 })
    const conflictDecision = page.locator('.vision-saved-search-import-conflict select')
    await conflictDecision.waitFor({ timeout: 10_000 })
    if (await conflictDecision.count() !== 1) throw new Error('Conflicting filter view import should expose one decision control')
    await conflictDecision.selectOption('overwrite')
    if (screenshotPath) {
      await page.locator('.vision-collection-saved-filters').scrollIntoViewIfNeeded()
      await page.screenshot({ path: screenshotPath, fullPage: false })
    }
    await page.getByRole('button', { name: '确认导入', exact: true }).click()
    const updatedSavedFilterButton = page.getByRole('button', { name: `应用筛选视图: ${conflictFilterName}`, exact: true })
    await updatedSavedFilterButton.waitFor({ timeout: 10_000 })
    if (await savedFilterButton.count() !== 0) throw new Error('Overwriting a conflicting filter should replace the old view name')
    await page.getByRole('button', { name: `删除筛选视图: ${conflictFilterName}`, exact: true }).click()
    if (await updatedSavedFilterButton.count() !== 0) throw new Error('Imported collection filter could not be deleted after conflict resolution')
    if (session.errors.length > 0) throw new Error(`Renderer errors during clip collection filter smoke:\n${session.errors.join('\n')}`)
    console.log(`AIVPlayer Smoke Vision Clip Collection Filter passed: ${JSON.stringify({ originalCount: originals.length, queryMatches: 2, tagMatches: 2, hierarchyTagMatches: 2, excludedTagMatches: 1, favoriteFilterMatches: 1, archivedFilterMatches: 1, activeFilterMatches: 2, collectionFlagsPersisted, singleFlagUndoPersisted, singleFlagRedoPersisted, batchFlagRedoPersisted, collectionTitleSort: true, collectionSelectionCountSort: true, collectionDurationSort: true, collectionOrderPersisted: true, multiTagAnyMatches: 2, multiTagAllMatches: 1, individualTagRemoval: true, visibleSelectionPreserved: true, emptyState: true, dataUnchanged, filterPersisted, savedFilterRestored: true, savedFilterDeleted: true, savedFilterExported: true, savedFilterImported: true, savedFilterImportPreview: true, savedFilterConflictOverwritten: true, excludedFilterPersisted: true, visibilityFilterPersisted: true, screenshotPath: screenshotPath ?? null })}`)
  } finally {
    if (app) await app.close().catch(() => undefined)
    await rm(userDataDirectory, { recursive: true, force: true }).catch(() => undefined)
  }
}

runSmoke().catch((error) => {
  console.error(error instanceof Error ? error.stack ?? error.message : String(error))
  process.exitCode = 1
})
