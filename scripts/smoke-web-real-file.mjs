import { _electron as electron } from 'playwright'
import { mkdtemp, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'

function readArguments() {
  let mediaPath = null
  let appPath = process.env.AIVPLAYER_SMOKE_APP_PATH ?? null
  for (let index = 2; index < process.argv.length; index += 1) {
    const argument = process.argv[index]
    if (argument === '--app') {
      appPath = process.argv[index + 1] ?? appPath
      index += 1
    } else if (argument && !argument.startsWith('-') && !mediaPath) {
      mediaPath = argument
    }
  }
  return { mediaPath, appPath }
}

function assertCondition(condition, message) {
  if (!condition) throw new Error(message)
}

const { mediaPath, appPath } = readArguments()
const resolvedMediaPath = mediaPath ?? '/Users/ponponon/Pictures/百万英镑.mp4'
const resolvedAppPath = appPath ?? join(process.cwd(), 'release/mac-arm64/AIVPlayer.app/Contents/MacOS/AIVPlayer')
const smokeHomeDirectory = await mkdtemp(join(tmpdir(), 'aivplayer-smoke-web-real-home-'))
const smokeUserDataDirectory = await mkdtemp(join(tmpdir(), 'aivplayer-smoke-web-real-user-data-'))
const app = await electron.launch({
  executablePath: resolvedAppPath,
  cwd: process.cwd(),
  args: [`--user-data-dir=${smokeUserDataDirectory}`, resolvedMediaPath],
  env: { ...process.env, HOME: smokeHomeDirectory }
})

try {
  const page = await app.firstWindow()
  await page.waitForSelector('#root', { timeout: 10_000 })
  const shareStatus = await page.evaluate(async () => {
    const files = await window.aiv.getInitialMediaFiles()
    return window.aiv.startWebShare({ filePaths: files.map((file) => file.path) })
  })
  assertCondition(shareStatus.urls.length > 0, 'Web share did not return an access URL')
  const accessUrl = new URL(shareStatus.urls[0])
  accessUrl.hostname = '127.0.0.1'
  const bootstrapResponse = await fetch(accessUrl, { redirect: 'manual' })
  const cookie = bootstrapResponse.headers.get('set-cookie')?.split(';')[0]
  assertCondition(bootstrapResponse.status === 302 && cookie, `Web session bootstrap failed: HTTP ${bootstrapResponse.status}`)

  const libraryResponse = await fetch(new URL('/api/v1/library', accessUrl), { headers: { Cookie: cookie } })
  const library = await libraryResponse.json()
  assertCondition(libraryResponse.ok && library.items.length === 1, 'The real file was not found in the Web library')
  const item = library.items[0]
  const detailsResponse = await fetch(new URL(`/api/v1/media/${item.id}`, accessUrl), { headers: { Cookie: cookie } })
  const details = await detailsResponse.json()
  assertCondition(detailsResponse.ok && Number.isFinite(details.durationSeconds) && details.durationSeconds > 5 * 60, 'The real file duration was not probed')

  const sourceSize = item.sizeBytes
  const rangeStart = sourceSize - 32
  const rangeResponse = await fetch(new URL(item.streamUrl, accessUrl), { headers: { Cookie: cookie, Range: `bytes=${rangeStart}-${sourceSize - 1}` } })
  const rangeBody = await rangeResponse.arrayBuffer()
  assertCondition(rangeResponse.status === 206, `Real file tail range returned HTTP ${rangeResponse.status}`)
  assertCondition(rangeBody.byteLength === 32, `Real file tail range returned ${rangeBody.byteLength} bytes`)
  assertCondition(rangeResponse.headers.get('content-range') === `bytes ${rangeStart}-${sourceSize - 1}/${sourceSize}`, 'Real file Content-Range is incorrect')

  console.log(JSON.stringify({
    status: 'WEB_REAL_FILE_OK',
    name: item.name,
    sizeBytes: sourceSize,
    durationSeconds: details.durationSeconds,
    browserSupport: details.browserSupport,
    tailRangeStatus: rangeResponse.status,
    tailRangeBytes: rangeBody.byteLength
  }))
} finally {
  await app.close().catch(() => undefined)
  await Promise.all([
    rm(smokeHomeDirectory, { recursive: true, force: true }),
    rm(smokeUserDataDirectory, { recursive: true, force: true })
  ])
}
