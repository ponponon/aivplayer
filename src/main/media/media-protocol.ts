import { protocol } from 'electron'
import { createReadStream, existsSync } from 'node:fs'
import { stat } from 'node:fs/promises'
import { randomUUID } from 'node:crypto'
import { basename, extname } from 'node:path'
import { Readable } from 'node:stream'
import type { MediaFile } from '../../shared/media-types'

export const MEDIA_PROTOCOL_SCHEME = 'aiv-media'

const mediaFilePathById = new Map<string, string>()

export type ByteRange = {
  start: number
  end: number
  contentLength: number
}

const CONTENT_TYPE_BY_EXTENSION = new Map<string, string>([
  ['.mp4', 'video/mp4'],
  ['.m4v', 'video/mp4'],
  ['.mov', 'video/quicktime'],
  ['.webm', 'video/webm'],
  ['.mkv', 'video/x-matroska'],
  ['.avi', 'video/x-msvideo'],
  ['.ts', 'video/mp2t'],
  ['.m2ts', 'video/mp2t'],
  ['.mpg', 'video/mpeg'],
  ['.mpeg', 'video/mpeg'],
  ['.mp3', 'audio/mpeg'],
  ['.m4a', 'audio/mp4'],
  ['.aac', 'audio/aac'],
  ['.wav', 'audio/wav'],
  ['.vtt', 'text/vtt; charset=utf-8'],
  ['.srt', 'application/x-subrip; charset=utf-8']
])

export function registerMediaProtocolScheme(): void {
  protocol.registerSchemesAsPrivileged([
    {
      scheme: MEDIA_PROTOCOL_SCHEME,
      privileges: {
        standard: true,
        secure: true,
        supportFetchAPI: true,
        stream: true
      }
    }
  ])
}

export function registerMediaProtocolHandler(): void {
  protocol.handle(MEDIA_PROTOCOL_SCHEME, async (request) => {
    const requestUrl = new URL(request.url)
    const id = requestUrl.pathname.replace(/^\//, '')
    const filePath = mediaFilePathById.get(id)

    if (!filePath || !existsSync(filePath)) {
      return new Response('Media file not found', { status: 404 })
    }

    return createFileResponse(filePath, request)
  })
}

export function getContentTypeForFile(filePath: string): string {
  return CONTENT_TYPE_BY_EXTENSION.get(extname(filePath).toLowerCase()) ?? 'application/octet-stream'
}

export function parseRangeHeader(rangeHeader: string | null, fileSize: number): ByteRange | null {
  if (!rangeHeader || fileSize <= 0) {
    return null
  }

  const match = /^bytes=(\d*)-(\d*)$/.exec(rangeHeader.trim())

  if (!match) {
    return null
  }

  const [, rawStart, rawEnd] = match

  if (!rawStart && !rawEnd) {
    return null
  }

  let start: number
  let end: number

  if (!rawStart) {
    const suffixLength = Number(rawEnd)

    if (!Number.isSafeInteger(suffixLength) || suffixLength <= 0) {
      return null
    }

    start = Math.max(fileSize - suffixLength, 0)
    end = fileSize - 1
  } else {
    start = Number(rawStart)
    end = rawEnd ? Number(rawEnd) : fileSize - 1

    if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end)) {
      return null
    }
  }

  if (start < 0 || start >= fileSize || end < start) {
    return null
  }

  end = Math.min(end, fileSize - 1)

  return {
    start,
    end,
    contentLength: end - start + 1
  }
}

async function createFileResponse(filePath: string, request: Request): Promise<Response> {
  const fileStat = await stat(filePath)
  const fileSize = fileStat.size
  const range = parseRangeHeader(request.headers.get('range'), fileSize)
  const commonHeaders = {
    'Accept-Ranges': 'bytes',
    'Content-Type': getContentTypeForFile(filePath)
  }

  if (request.headers.get('range') && !range) {
    return new Response(null, {
      status: 416,
      headers: {
        ...commonHeaders,
        'Content-Range': `bytes */${fileSize}`
      }
    })
  }

  if (range) {
    const body =
      request.method === 'HEAD'
        ? null
        : (Readable.toWeb(createReadStream(filePath, { start: range.start, end: range.end })) as ReadableStream)

    return new Response(body, {
      status: 206,
      headers: {
        ...commonHeaders,
        'Content-Length': String(range.contentLength),
        'Content-Range': `bytes ${range.start}-${range.end}/${fileSize}`
      }
    })
  }

  const body = request.method === 'HEAD' ? null : (Readable.toWeb(createReadStream(filePath)) as ReadableStream)

  return new Response(body, {
    status: 200,
    headers: {
      ...commonHeaders,
      'Content-Length': String(fileSize)
    }
  })
}

export function createMediaFile(filePath: string): MediaFile {
  const id = randomUUID()
  const extension = extname(filePath).replace('.', '').toLowerCase()
  mediaFilePathById.set(id, filePath)

  return {
    id,
    name: basename(filePath),
    path: filePath,
    url: `${MEDIA_PROTOCOL_SCHEME}://file/${id}`,
    extension
  }
}
