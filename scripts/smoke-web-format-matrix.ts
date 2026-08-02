import { execFile } from 'node:child_process'
import { copyFile, mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { extname, join, resolve } from 'node:path'
import { promisify } from 'node:util'
import { WebServer } from '../src/desktop/web/web-server.ts'

const execFileAsync = promisify(execFile)

type FormatCase = {
  name: string
  extension: string
  expectedSupport: 'likely' | 'possible' | 'needs-transcode'
  transcode: boolean
  create: (ffmpegPath: string, basePath: string, outputPath: string) => Promise<void>
}

const formatCases: FormatCase[] = [
  {
    name: 'MP4 H.264/AAC',
    extension: '.mp4',
    expectedSupport: 'likely',
    transcode: false,
    create: (_ffmpegPath, basePath, outputPath) => copyFile(basePath, outputPath)
  },
  {
    name: 'WebM VP9/Opus',
    extension: '.webm',
    expectedSupport: 'likely',
    transcode: false,
    create: (ffmpegPath, basePath, outputPath) => execFfmpeg(ffmpegPath, [
      '-i', basePath, '-c:v', 'libvpx-vp9', '-deadline', 'realtime', '-cpu-used', '8', '-crf', '35', '-b:v', '0',
      '-c:a', 'libopus', '-b:a', '64k', outputPath
    ])
  },
  {
    name: 'MOV H.264/AAC',
    extension: '.mov',
    expectedSupport: 'possible',
    transcode: true,
    create: (ffmpegPath, basePath, outputPath) => execFfmpeg(ffmpegPath, ['-i', basePath, '-c', 'copy', outputPath])
  },
  {
    name: 'MKV H.264/AAC',
    extension: '.mkv',
    expectedSupport: 'possible',
    transcode: true,
    create: (ffmpegPath, basePath, outputPath) => execFfmpeg(ffmpegPath, ['-i', basePath, '-c', 'copy', outputPath])
  },
  {
    name: 'MPEG-TS H.264/AAC',
    extension: '.ts',
    expectedSupport: 'possible',
    transcode: true,
    create: (ffmpegPath, basePath, outputPath) => execFfmpeg(ffmpegPath, ['-i', basePath, '-c', 'copy', '-f', 'mpegts', outputPath])
  },
  {
    name: 'AVI MPEG-4/MP3',
    extension: '.avi',
    expectedSupport: 'needs-transcode',
    transcode: true,
    create: (ffmpegPath, basePath, outputPath) => execFfmpeg(ffmpegPath, ['-i', basePath, '-c:v', 'mpeg4', '-vtag', 'xvid', '-c:a', 'libmp3lame', '-q:a', '5', outputPath])
  },
  {
    name: 'raw H.265',
    extension: '.h265',
    expectedSupport: 'needs-transcode',
    transcode: true,
    create: (ffmpegPath, basePath, outputPath) => execFfmpeg(ffmpegPath, ['-i', basePath, '-an', '-c:v', 'libx265', '-preset', 'ultrafast', '-x265-params', 'log-level=error', '-f', 'hevc', outputPath])
  },
  {
    name: 'raw H.264',
    extension: '.h264',
    expectedSupport: 'needs-transcode',
    transcode: true,
    create: (ffmpegPath, basePath, outputPath) => execFfmpeg(ffmpegPath, ['-i', basePath, '-an', '-c:v', 'libx264', '-preset', 'ultrafast', '-f', 'h264', outputPath])
  },
  {
    name: 'raw Motion JPEG',
    extension: '.mjpeg',
    expectedSupport: 'needs-transcode',
    transcode: true,
    create: (ffmpegPath, basePath, outputPath) => execFfmpeg(ffmpegPath, ['-i', basePath, '-an', '-c:v', 'mjpeg', '-q:v', '5', '-f', 'mjpeg', outputPath])
  },
  {
    name: 'YUV4MPEG2',
    extension: '.y4m',
    expectedSupport: 'needs-transcode',
    transcode: true,
    create: (ffmpegPath, basePath, outputPath) => execFfmpeg(ffmpegPath, ['-i', basePath, '-an', '-c:v', 'rawvideo', '-pix_fmt', 'yuv420p', '-f', 'yuv4mpegpipe', outputPath])
  }
]

async function execFfmpeg(ffmpegPath: string, args: string[]): Promise<void> {
  await execFileAsync(ffmpegPath, ['-hide_banner', '-loglevel', 'error', '-y', ...args], {
    maxBuffer: 2 * 1024 * 1024,
    timeout: 120_000
  })
}

function getArgument(name: string): string | null {
  const index = process.argv.indexOf(name)
  const value = index >= 0 ? process.argv[index + 1] : null
  return value && !value.startsWith('-') ? value : null
}

function assertCondition(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message)
}

async function getSessionCookie(accessUrl: URL): Promise<string> {
  const response = await fetch(accessUrl, { redirect: 'manual' })
  const cookie = response.headers.get('set-cookie')?.split(';')[0]
  assertCondition(response.status === 302 && cookie, `Web session bootstrap failed: HTTP ${response.status}`)
  return cookie
}

async function fetchJson<T>(url: URL, cookie: string, init: RequestInit = {}): Promise<T> {
  const response = await fetch(url, { ...init, headers: { Cookie: cookie, ...(init.headers ?? {}) } })
  const body = await response.json() as T & { message?: string }
  assertCondition(response.ok, `${init.method ?? 'GET'} ${url.pathname} failed: HTTP ${response.status} ${body.message ?? ''}`)
  return body
}

async function assertRange(url: URL, cookie: string, expectedContentType: string | null = null): Promise<void> {
  const response = await fetch(url, { headers: { Cookie: cookie, Range: 'bytes=0-15' } })
  assertCondition(response.status === 206, `${url.pathname} did not return HTTP 206`)
  assertCondition((await response.arrayBuffer()).byteLength === 16, `${url.pathname} returned an unexpected range length`)
  assertCondition(response.headers.get('accept-ranges') === 'bytes', `${url.pathname} omitted Accept-Ranges`)
  if (expectedContentType) assertCondition(response.headers.get('content-type')?.startsWith(expectedContentType), `${url.pathname} returned an unexpected content type`)
}

async function waitForTranscode(baseUrl: URL, id: string, cookie: string): Promise<{ state: string; streamUrl: string | null }> {
  for (let attempt = 0; attempt < 180; attempt += 1) {
    const status = await fetchJson<{ state: string; streamUrl: string | null }>(new URL(`/api/v1/transcode/${id}`, baseUrl), cookie)
    if (status.state === 'ready' || status.state === 'error') return status
    await new Promise((resolvePromise) => setTimeout(resolvePromise, 500))
  }
  throw new Error(`Transcode timed out for ${id}`)
}

async function main(): Promise<void> {
  const ffmpegPath = getArgument('--ffmpeg') ?? process.env.AIVPLAYER_SMOKE_FFMPEG_PATH ?? 'ffmpeg'
  const directory = await mkdtemp(join(tmpdir(), 'aivplayer-web-format-matrix-'))
  const basePath = join(directory, 'base.mp4')
  const webRoot = resolve('out/web')
  const server = new WebServer({
    resourcePath: directory,
    webRoot,
    bindHost: '127.0.0.1',
    getFfmpegPath: async () => ffmpegPath,
    cacheRoot: join(directory, 'transcode-cache')
  })

  try {
    await execFfmpeg(ffmpegPath, [
      '-f', 'lavfi', '-i', 'testsrc2=size=320x180:rate=24',
      '-f', 'lavfi', '-i', 'sine=frequency=880:sample_rate=48000',
      '-t', '2', '-map', '0:v:0', '-map', '1:a:0',
      '-c:v', 'libx264', '-preset', 'ultrafast', '-pix_fmt', 'yuv420p',
      '-c:a', 'aac', '-ar', '48000', '-ac', '2', '-shortest', '-movflags', '+faststart', basePath
    ])

    const paths: string[] = []
    for (const formatCase of formatCases) {
      const outputPath = join(directory, `sample${formatCase.extension}`)
      await formatCase.create(ffmpegPath, basePath, outputPath)
      paths.push(outputPath)
    }

    const status = await server.start({ filePaths: paths })
    const accessUrl = new URL(status.urls[0]!)
    const cookie = await getSessionCookie(accessUrl)
    const library = await fetchJson<{ items: Array<{ id: string; name: string; extension: string; streamUrl: string; browserSupport: string; transcodeUrl: string }> }>(new URL('/api/v1/library', accessUrl), cookie)

    for (const formatCase of formatCases) {
      const item = library.items.find((candidate) => candidate.extension === formatCase.extension)
      assertCondition(item, `Library did not discover ${formatCase.name}`)
      assertCondition(item.browserSupport === formatCase.expectedSupport, `${formatCase.name} classified as ${item.browserSupport}, expected ${formatCase.expectedSupport}`)
      const details = await fetchJson<{ browserSupport: string }>(new URL(`/api/v1/media/${item.id}`, accessUrl), cookie)
      assertCondition(details.browserSupport === formatCase.expectedSupport, `${formatCase.name} details classified as ${details.browserSupport}, expected ${formatCase.expectedSupport}`)
      await assertRange(new URL(item.streamUrl, accessUrl), cookie)

      if (formatCase.transcode) {
        const startStatus = await fetchJson<{ state: string }>(new URL(item.transcodeUrl, accessUrl), cookie, { method: 'POST' })
        assertCondition(['queued', 'running', 'ready'].includes(startStatus.state), `${formatCase.name} returned unexpected transcode state ${startStatus.state}`)
        const finalStatus = await waitForTranscode(accessUrl, item.id, cookie)
        assertCondition(finalStatus.state === 'ready' && finalStatus.streamUrl, `${formatCase.name} transcode failed: ${finalStatus.state}`)
        await assertRange(new URL(finalStatus.streamUrl, accessUrl), cookie, 'video/mp4')
      }

      console.log(`WEB_FORMAT_OK format=${extname(item.name).slice(1)} support=${item.browserSupport} transcode=${formatCase.transcode ? 'ready' : 'skipped'}`)
    }
    console.log(`WEB_FORMAT_MATRIX_OK cases=${formatCases.length}`)
  } finally {
    await server.stop().catch(() => undefined)
    await rm(directory, { recursive: true, force: true })
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error)
  process.exitCode = 1
})
