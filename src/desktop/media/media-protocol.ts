import { protocol } from 'electron'
import { createReadStream, existsSync } from 'node:fs'
import { stat } from 'node:fs/promises'
import { randomUUID } from 'node:crypto'
import { basename, extname } from 'node:path'
import { Readable } from 'node:stream'
import type { MediaFile } from '../../shared/media-types'
import { parseRangeHeader, type ByteRange } from '../../core/media/byte-range'

export const MEDIA_PROTOCOL_SCHEME = 'aiv-media'

const mediaFilePathById = new Map<string, string>()

export { parseRangeHeader } from '../../core/media/byte-range'
export type { ByteRange } from '../../core/media/byte-range'

const CONTENT_TYPE_BY_EXTENSION = new Map<string, string>([
  ['.mp4', 'video/mp4'],
  ['.m4v', 'video/mp4'],
  ['.mov', 'video/quicktime'],
  ['.webm', 'video/webm'],
  ['.ogv', 'video/ogg'],
  ['.mkv', 'video/x-matroska'],
  ['.avi', 'video/x-msvideo'],
  ['.flv', 'video/x-flv'],
  ['.wmv', 'video/x-ms-wmv'],
  ['.ts', 'video/mp2t'],
  ['.m2ts', 'video/mp2t'],
  ['.mts', 'video/mp2t'],
  ['.mpg', 'video/mpeg'],
  ['.mpeg', 'video/mpeg'],
  ['.3gp', 'video/3gpp'],
  ['.3g2', 'video/3gpp2'],
  ['.vob', 'video/dvd'],
  ['.asf', 'video/x-ms-asf'],
  ['.mxf', 'application/mxf'],
  ['.divx', 'video/divx'],
  ['.rm', 'application/vnd.rn-realmedia'],
  ['.rmvb', 'application/vnd.rn-realmedia-vbr'],
  ['.mp3', 'audio/mpeg'],
  ['.m4a', 'audio/mp4'],
  ['.aac', 'audio/aac'],
  ['.wav', 'audio/wav'],
  ['.vtt', 'text/vtt; charset=utf-8'],
  ['.srt', 'application/x-subrip; charset=utf-8']
  , ['.png', 'image/png']
  , ['.jpg', 'image/jpeg']
  , ['.jpeg', 'image/jpeg']
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
