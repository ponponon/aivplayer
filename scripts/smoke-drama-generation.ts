import { _electron as electron, type ElectronApplication, type Page } from 'playwright'
import { access, mkdtemp, readFile, rm } from 'node:fs/promises'
import { createServer, type Server } from 'node:http'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

type SmokeSession = {
  app: ElectronApplication
  page: Page
  errors: string[]
}

const MEDIA_TYPES = ['image', 'video', 'audio'] as const

function fixtureFor(mediaType: typeof MEDIA_TYPES[number]): { bytes: Buffer; mimeType: string } {
  if (mediaType === 'image') {
    return {
      bytes: Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=', 'base64'),
      mimeType: 'image/png'
    }
  }
  if (mediaType === 'audio') {
    const bytes = Buffer.alloc(44 + 320)
    bytes.write('RIFF', 0)
    bytes.writeUInt32LE(bytes.length - 8, 4)
    bytes.write('WAVEfmt ', 8)
    bytes.writeUInt32LE(16, 16)
    bytes.writeUInt16LE(1, 20)
    bytes.writeUInt16LE(1, 22)
    bytes.writeUInt32LE(16_000, 24)
    bytes.writeUInt32LE(32_000, 28)
    bytes.writeUInt16LE(2, 32)
    bytes.writeUInt16LE(16, 34)
    bytes.write('data', 36)
    bytes.writeUInt32LE(320, 40)
    return { bytes, mimeType: 'audio/wav' }
  }
  return { bytes: Buffer.from('AIVPLAYER_DRAMA_SMOKE_VIDEO'), mimeType: 'video/mp4' }
}

async function readRequestBody(request: NodeJS.ReadableStream): Promise<string> {
  const chunks: Buffer[] = []
  for await (const chunk of request) chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk)))
  return Buffer.concat(chunks).toString('utf8')
}

async function startFixtureServer(): Promise<{ server: Server; baseUrl: string; requests: string[] }> {
  const requests: string[] = []
  let baseUrl = ''
  const server = createServer(async (request, response) => {
    const url = new URL(request.url ?? '/', 'http://127.0.0.1')
    const method = request.method ?? 'GET'
    requests.push(`${method} ${url.pathname}`)
    if (method === 'POST' && url.pathname === '/generate') {
      let mediaType: typeof MEDIA_TYPES[number] = 'image'
      try {
        const body = JSON.parse(await readRequestBody(request)) as { mediaType?: string }
        if (MEDIA_TYPES.includes(body.mediaType as typeof MEDIA_TYPES[number])) mediaType = body.mediaType as typeof MEDIA_TYPES[number]
      } catch {
        response.writeHead(400, { 'content-type': 'application/json' })
        response.end(JSON.stringify({ error: 'invalid fixture request' }))
        return
      }
      response.writeHead(200, { 'content-type': 'application/json' })
      response.end(JSON.stringify({
        resultUrl: `${baseUrl}/result/${mediaType}`,
        providerId: `smoke-${mediaType}`,
        model: 'smoke-model',
        cost: 0.123456,
        parameters: { smoke: true }
      }))
      return
    }
    const match = url.pathname.match(/^\/result\/(image|video|audio)$/)
    if (method === 'GET' && match) {
      const fixture = fixtureFor(match[1] as typeof MEDIA_TYPES[number])
      response.writeHead(200, { 'content-type': fixture.mimeType, 'content-length': fixture.bytes.length })
      response.end(fixture.bytes)
      return
    }
    response.writeHead(404, { 'content-type': 'application/json' })
    response.end(JSON.stringify({ error: 'not found' }))
  })
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject)
    server.listen(0, '127.0.0.1', () => resolve())
  })
  const address = server.address()
  if (!address || typeof address === 'string') throw new Error('短剧 Smoke fixture server 未取得端口')
  baseUrl = `http://127.0.0.1:${address.port}`
  return { server, baseUrl, requests }
}

async function launchSession(userDataDirectory: string, homeDirectory: string): Promise<SmokeSession> {
  const app = await electron.launch({
    args: ['--no-sandbox', '--in-process-gpu', `--user-data-dir=${userDataDirectory}`, 'out/main/index.js'],
    env: { ...process.env, HOME: homeDirectory }
  })
  const page = await app.firstWindow()
  const errors: string[] = []
  page.on('console', (message) => { if (message.type() === 'error') errors.push(`console: ${message.text()}`) })
  page.on('pageerror', (error) => errors.push(`page: ${error.message}`))
  await page.waitForLoadState('domcontentloaded')
  await page.waitForSelector('#root', { timeout: 15_000 })
  await page.locator('.panel-tab').nth(5).click()
  await page.locator('.drama-panel').waitFor({ timeout: 15_000 })
  return { app, page, errors }
}

async function waitForFiles(paths: readonly string[]): Promise<void> {
  await Promise.all(paths.map(async (path) => {
    await access(path)
    const content = await readFile(path)
    if (content.length === 0) throw new Error(`短剧 Smoke 结果文件为空：${path}`)
  }))
}

async function main(): Promise<void> {
  const homeDirectory = await mkdtemp(join(tmpdir(), 'aivplayer-smoke-drama-home-'))
  const userDataDirectory = await mkdtemp(join(tmpdir(), 'aivplayer-smoke-drama-user-data-'))
  const fixture = await startFixtureServer()
  let session: SmokeSession | null = null
  let restarted: SmokeSession | null = null
  try {
    const mediaSettings = Object.fromEntries(MEDIA_TYPES.map((mediaType) => [mediaType, {
      providerId: 'http-json',
      apiBaseUrl: `${fixture.baseUrl}/generate`,
      model: 'smoke-model',
      costPerRequest: 0.01
    }]))
    session = await launchSession(userDataDirectory, homeDirectory)
    const project = await session.page.evaluate(() => window.aiv.createDramaProject({ title: `Smoke 短剧 ${Date.now()}`, genre: 'Smoke' }))
    await session.page.evaluate((settings) => window.aiv.setDramaProviderSettings({ media: settings }), mediaSettings)
    const tasks = await Promise.all(MEDIA_TYPES.map((mediaType) => session!.page.evaluate((input) => window.aiv.createDramaGenerationTask(input.projectId, input.task), {
      projectId: project.id,
      task: { mediaType, prompt: `Smoke ${mediaType} generation`, maxAttempts: 1 }
    })))
    const completed = await session.page.evaluate((projectId) => window.aiv.runDramaGenerationQueue(projectId), project.id)
    if (completed.length !== tasks.length || completed.some((task) => task.status !== 'completed' || !task.resultPath || task.providerId !== `smoke-${task.mediaType}` || task.actualCost !== 0.123456)) {
      throw new Error(`短剧 Smoke 队列结果异常：${JSON.stringify(completed)}`)
    }
    const resultPaths = completed.map((task) => task.resultPath).filter((path): path is string => Boolean(path))
    await waitForFiles(resultPaths)
    const taskCenterEvents = await session.page.evaluate(() => window.aiv.getTaskCenterEvents())
    if (!taskCenterEvents.some((event) => event.kind === 'drama-generation' && event.status === 'completed')) {
      throw new Error(`短剧 Smoke 未记录任务中心终态：${JSON.stringify(taskCenterEvents)}`)
    }
    if (fixture.requests.filter((request) => request.startsWith('POST /generate')).length !== 3 || fixture.requests.filter((request) => request.startsWith('GET /result/')).length !== 3) {
      throw new Error(`短剧 Smoke Provider 请求数量异常：${JSON.stringify(fixture.requests)}`)
    }
    const firstErrors = [...session.errors]
    await session.app.close()
    session = null

    restarted = await launchSession(userDataDirectory, homeDirectory)
    const restored = await restarted.page.evaluate((projectId) => window.aiv.getDramaProjectData(projectId), project.id)
    if (restored.generationTasks.length !== 3 || restored.generationTasks.some((task) => task.status !== 'completed' || !task.resultPath)) {
      throw new Error(`短剧 Smoke 重启恢复异常：${JSON.stringify(restored.generationTasks)}`)
    }
    if (firstErrors.length > 0 || restarted.errors.length > 0) throw new Error(`短剧 Smoke Renderer 错误：${JSON.stringify([...firstErrors, ...restarted.errors])}`)
    console.log(JSON.stringify({ projectId: project.id, tasks: restored.generationTasks.map((task) => ({ mediaType: task.mediaType, status: task.status, providerId: task.providerId, actualCost: task.actualCost })), requests: fixture.requests }))
  } finally {
    await session?.app.close().catch(() => undefined)
    await restarted?.app.close().catch(() => undefined)
    await new Promise<void>((resolve) => fixture.server.close(() => resolve()))
    await rm(homeDirectory, { recursive: true, force: true })
    await rm(userDataDirectory, { recursive: true, force: true })
  }
}

void main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.stack ?? error.message : String(error))
  process.exitCode = 1
})
