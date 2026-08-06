import { protocol } from 'electron'
import { createReadStream, existsSync, statSync } from 'node:fs'
import { stat } from 'node:fs/promises'
import { createHash, randomUUID } from 'node:crypto'
import { basename, extname } from 'node:path'
import { Readable } from 'node:stream'
import type { MediaFile } from '../../shared/media-types'
import { parseRangeHeader, type ByteRange } from '../../core/media/byte-range'
import { getContentTypeForFile } from '../../core/media/media-mime'

export const MEDIA_PROTOCOL_SCHEME = 'aiv-media'

const mediaFilePathById = new Map<string, string>()

export { parseRangeHeader } from '../../core/media/byte-range'
export type { ByteRange } from '../../core/media/byte-range'

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

export { getContentTypeForFile } from '../../core/media/media-mime'

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
  let fingerprint = createHash('sha256').update(filePath).digest('hex').slice(0, 24)
  try {
    const fileStat = statSync(filePath)
    fingerprint = createHash('sha256').update(`${filePath}|${fileStat.size}|${fileStat.mtimeMs}`).digest('hex').slice(0, 24)
  } catch {
    // The path-only fallback still lets the player open virtual or newly-created files.
  }
  mediaFilePathById.set(id, filePath)

  return {
    id,
    name: basename(filePath),
    path: filePath,
    url: `${MEDIA_PROTOCOL_SCHEME}://file/${id}`,
    extension,
    fingerprint
  }
}
