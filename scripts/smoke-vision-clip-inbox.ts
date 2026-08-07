import { mkdtemp } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { _electron as electron, type ElectronApplication, type Page } from 'playwright'

const mediaPath = process.argv[2] ?? '/Users/ponponon/Music/aivplayer_test_video_1min.mp4'

const copyByLocale = {
  'zh-CN': {
    visionTitle: '影视库搜索',
    saveCollection: '保存选段集合',
    savedCollections: '已保存的选段集合',
    openCollection: '生成剪辑工程',
    repairCollectionSources: '修复源文件'
  },
  'en-US': {
    visionTitle: 'Video library search',
    saveCollection: 'Save clip collection',
    savedCollections: 'Saved clip collections',
    openCollection: 'Create editing project',
    repairCollectionSources: 'Repair source files'
  },
  'ja-JP': {
    visionTitle: '動画ライブラリ検索',
    saveCollection: 'クリップコレクションを保存',
    savedCollections: '保存済みクリップコレクション',
    openCollection: '編集プロジェクトを作成',
    repairCollectionSources: 'ソースファイルを修復'
  },
  'ko-KR': {
    visionTitle: '영상 라이브러리 검색',
    saveCollection: '클립 컬렉션 저장',
    savedCollections: '저장된 클립 컬렉션',
    openCollection: '편집 프로젝트 만들기',
    repairCollectionSources: '소스 파일 복구'
  }
} as const

type SmokeCopy = (typeof copyByLocale)[keyof typeof copyByLocale]

function getCopy(locale: string): SmokeCopy {
  return copyByLocale[locale as keyof typeof copyByLocale] ?? copyByLocale['zh-CN']
}

async function launchPlayer(userDataDirectory: string): Promise<{ app: ElectronApplication; page: Page; errors: string[] }> {
  const app = await electron.launch({
    args: ['--no-sandbox', `--user-data-dir=${userDataDirectory}`, 'out/main/index.js', mediaPath],
    env: { ...process.env, HOME: userDataDirectory }
  })
  const page = await app.firstWindow()
  const errors: string[] = []
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(`console: ${message.text()}`)
    console.log(`[renderer:${message.type()}] ${message.text()}`)
  })
  page.on('pageerror', (error) => {
    errors.push(`page: ${error.message}`)
    console.log(`[renderer:error] ${error.message}`)
  })
  await page.waitForLoadState('domcontentloaded')
  await page.waitForSelector('#root', { timeout: 10_000 })
  await page.locator('video.video-surface').waitFor({ timeout: 15_000 })
  return { app, page, errors }
}

async function openVisionPanel(page: Page): Promise<SmokeCopy> {
  const locale = await page.evaluate(() => window.aiv.getAppSettings().then((settings) => settings.ui.locale))
  const copy = getCopy(locale)
  await page.getByRole('tab', { name: copy.visionTitle }).click()
  await page.locator('.vision-panel').waitFor({ timeout: 10_000 })
  return copy
}

async function waitForIndexButton(page: Page): Promise<void> {
  await page.waitForFunction(() => {
    const button = document.querySelector('.vision-index-actions .vision-primary-action') as HTMLButtonElement | null
    return Boolean(button && !button.disabled)
  }, undefined, { timeout: 15_000 })
}

async function runSmoke(): Promise<void> {
  const smokeUserDataDirectory = await mkdtemp(join(tmpdir(), 'aivplayer-smoke-vision-clip-inbox-user-data-'))
  const collectionTitle = `Clip Inbox Smoke ${Date.now()}`
  let firstApp: ElectronApplication | null = null
  let secondApp: ElectronApplication | null = null

  try {
    const firstSession = await launchPlayer(smokeUserDataDirectory)
    firstApp = firstSession.app
    const firstPage = firstSession.page
    const copy = await openVisionPanel(firstPage)

    await waitForIndexButton(firstPage)
    const initialMediaFiles = await firstPage.evaluate(() => window.aiv.getInitialMediaFiles())
    const beforeIndexStatus = await firstPage.evaluate(() => window.aiv.getVisionStatus())
    console.log(`Clip Inbox index input: ${JSON.stringify({ initialMediaFiles: initialMediaFiles.map((file) => ({ path: file.path, id: file.id })), indexedFrameCount: beforeIndexStatus.indexedFrameCount, modelAvailable: beforeIndexStatus.available })}`)
    await firstPage.evaluate(() => {
      const smokeWindow = window as typeof window & { __visionSmokeProgress?: unknown }
      smokeWindow.__visionSmokeProgress = null
      window.aiv.onVisionIndexProgress((progress) => {
        smokeWindow.__visionSmokeProgress = progress
      })
    })
    await firstPage.locator('.vision-index-actions .vision-primary-action').click()
    await firstPage.waitForFunction(() => {
      const progress = (window as typeof window & { __visionSmokeProgress?: { status?: string } }).__visionSmokeProgress
      return progress?.status === 'completed' || progress?.status === 'error' || progress?.status === 'cancelled'
    }, undefined, { timeout: 60_000 })

    const indexedStatus = await firstPage.evaluate(() => window.aiv.getVisionStatus())
    if (indexedStatus.indexedFrameCount < 2) {
      const diagnostics = await firstPage.evaluate(() => ({
        progress: (window as typeof window & { __visionSmokeProgress?: unknown }).__visionSmokeProgress,
        error: document.querySelector('.vision-error-card')?.textContent?.trim() ?? '',
        progressLabel: document.querySelector('.vision-progress')?.textContent?.trim() ?? '',
        body: document.querySelector('.vision-panel')?.textContent?.slice(0, 2000) ?? ''
      }))
      throw new Error(`Vision index did not produce enough frames: ${JSON.stringify({ status: indexedStatus, ...diagnostics })}`)
    }

    const searchInput = firstPage.locator('.vision-text-search input')
    await searchInput.fill('aivplayer')
    await firstPage.locator('.vision-text-search .vision-search-button').click()
    await firstPage.waitForFunction(() => document.querySelectorAll('.vision-result-row').length >= 2, undefined, { timeout: 30_000 })

    const checkboxes = firstPage.locator('.vision-result-select input[type="checkbox"]')
    if (await checkboxes.count() < 2) throw new Error('Vision search returned fewer than two selectable results')
    await checkboxes.nth(0).check()
    await checkboxes.nth(1).check()
    await firstPage.locator('.vision-selection-actions').waitFor({ timeout: 10_000 })
    await firstPage.locator('.vision-selection-actions .vision-collection-title-input').nth(0).fill(collectionTitle)
    await firstPage.locator('.vision-selection-actions .vision-collection-title-input').nth(1).fill('smoke, regression')
    await firstPage.getByRole('button', { name: copy.saveCollection }).click()

    const savedCollection = firstPage.locator('.vision-collection').filter({ hasText: collectionTitle })
    await savedCollection.waitFor({ timeout: 10_000 })
    const persistedCollections = await firstPage.evaluate(() => window.aiv.listVisionClipCollections())
    const persistedCollection = persistedCollections.find((collection) => collection.title === collectionTitle)
    if (!persistedCollection || persistedCollection.selections.length !== 2 || persistedCollection.tags.join(',') !== 'smoke,regression') {
      throw new Error(`Clip Inbox IPC persistence mismatch: ${JSON.stringify(persistedCollections)}`)
    }

    const firstSmokeState = await firstPage.evaluate(() => ({
      indexedFrames: window.document.querySelector('.vision-model-status small')?.textContent ?? '',
      resultCount: document.querySelectorAll('.vision-result-row').length,
      collectionCount: document.querySelectorAll('.vision-collection').length
    }))
    console.log(`Clip Inbox saved: ${JSON.stringify({ collectionTitle, persistedSelections: persistedCollection.selections.length, firstSmokeState })}`)

    const missingSourcePath = join(smokeUserDataDirectory, 'missing-source.mp4')
    const collectionWithMissingSource = {
      ...persistedCollection,
      selections: persistedCollection.selections.map((selection, index) => index === 0
        ? { ...selection, videoPath: missingSourcePath, fileName: 'missing-source.mp4' }
        : selection)
    }
    await firstPage.evaluate((collection) => window.aiv.saveVisionClipCollection(collection), collectionWithMissingSource)
    await firstPage.reload()
    await firstPage.waitForLoadState('domcontentloaded')
    await firstPage.locator('video.video-surface').waitFor({ timeout: 15_000 })
    const missingSourceCopy = await openVisionPanel(firstPage)
    const missingSourceCollection = firstPage.locator('.vision-collection').filter({ hasText: collectionTitle })
    await missingSourceCollection.locator('.vision-collection-missing').waitFor({ timeout: 10_000 })
    await missingSourceCollection.getByRole('button', { name: missingSourceCopy.repairCollectionSources }).waitFor({ timeout: 10_000 })
    const missingSourceNotice = await missingSourceCollection.locator('.vision-collection-missing').textContent()
    console.log(`Clip Inbox missing source notice: ${JSON.stringify({ missingSourcePath, notice: missingSourceNotice?.trim() ?? '' })}`)

    await firstPage.evaluate((collection) => window.aiv.saveVisionClipCollection(collection), persistedCollection)

    await firstApp.close()
    firstApp = null

    const secondSession = await launchPlayer(smokeUserDataDirectory)
    secondApp = secondSession.app
    const secondPage = secondSession.page
    const secondCopy = await openVisionPanel(secondPage)
    const restoredCollection = secondPage.locator('.vision-collection').filter({ hasText: collectionTitle })
    await restoredCollection.waitFor({ timeout: 10_000 })
    if (await secondPage.locator('.vision-collection').count() < 1) throw new Error('Clip Inbox collection was not restored after restart')
    const collectionMediaDiagnostics = await secondPage.evaluate(async () => {
      const collections = await window.aiv.listVisionClipCollections()
      const collection = collections[0]
      const path = collection?.selections[0]?.videoPath ?? ''
      const [file, metadata] = path ? await Promise.all([window.aiv.createMediaFile(path), window.aiv.getMediaMetadata(path)]) : [null, null]
      return { path, fileId: file?.id ?? null, duration: metadata?.durationSeconds ?? null, width: metadata?.video?.width ?? null, height: metadata?.video?.height ?? null, probeSource: metadata?.probeSource ?? null }
    })
    console.log(`Clip Inbox restored media: ${JSON.stringify(collectionMediaDiagnostics)}`)

    await restoredCollection.getByRole('button', { name: secondCopy.openCollection }).click()
    try {
      await secondPage.locator('[data-testid="editing-timeline"]').waitFor({ timeout: 30_000 })
    } catch (error) {
      const diagnostics = await secondPage.evaluate(() => ({
        body: document.body.innerText.slice(0, 3000),
        visionError: document.querySelector('.vision-error-card')?.textContent?.trim() ?? '',
        projectStatus: document.querySelector('.editing-project-status')?.textContent?.trim() ?? '',
        currentVideo: (() => {
          const video = document.querySelector('video.video-surface') as HTMLVideoElement | null
          return video ? { src: video.currentSrc, duration: video.duration, width: video.videoWidth, height: video.videoHeight } : null
        })(),
        collectionButtons: Array.from(document.querySelectorAll('.vision-collection button')).map((button) => ({ text: button.textContent, title: button.getAttribute('title') }))
      }))
      throw new Error(`Clip Inbox collection did not open an editing project: ${JSON.stringify({ ...diagnostics, rendererErrors: secondSession.errors })}`)
    }
    await secondPage.waitForFunction(() => document.querySelectorAll('.editing-clip').length >= 2, undefined, { timeout: 15_000 })

    const editingState = await secondPage.evaluate(() => ({
      title: document.querySelector('.editing-toolbar-heading strong')?.textContent ?? '',
      status: document.querySelector('.editing-project-status')?.textContent ?? '',
      clipCount: document.querySelectorAll('.editing-clip').length,
      sourceVideo: (() => {
        const video = document.querySelector('video.video-surface') as HTMLVideoElement | null
        return video ? { width: video.videoWidth, height: video.videoHeight, duration: video.duration } : null
      })()
    }))
    if (editingState.clipCount < 2) throw new Error(`Editing project did not contain two clips: ${JSON.stringify(editingState)}`)
    if (!editingState.sourceVideo || editingState.sourceVideo.width <= 0 || editingState.sourceVideo.height <= 0 || editingState.sourceVideo.duration <= 0) {
      throw new Error(`Editing project media metadata is not ready: ${JSON.stringify(editingState)}`)
    }
    if (!editingState.title.includes(collectionTitle)) throw new Error(`Editing project title did not preserve collection title: ${editingState.title}`)
    console.log(`Clip Inbox editing project restored: ${JSON.stringify(editingState)}`)

    const rendererErrors = [...firstSession.errors, ...secondSession.errors]
    if (rendererErrors.length > 0) throw new Error(`Renderer errors during Clip Inbox smoke:\n${rendererErrors.join('\n')}`)
    console.log(`AIVPlayer Smoke Vision Clip Inbox passed for ${mediaPath}`)
  } finally {
    if (secondApp) await secondApp.close().catch(() => undefined)
    if (firstApp) await firstApp.close().catch(() => undefined)
  }
}

runSmoke().catch((error) => {
  console.error(error instanceof Error ? error.stack ?? error.message : String(error))
  process.exitCode = 1
})
