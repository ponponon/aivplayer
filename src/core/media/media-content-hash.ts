import { createHash } from 'node:crypto'
import { createReadStream } from 'node:fs'
import { stat } from 'node:fs/promises'
import { normalizeMediaContentHash } from '../../shared/media-content-hash.ts'

const CONTENT_HASH_CHUNK_BYTES = 4 * 1024 * 1024

export { normalizeMediaContentHash }

function createAbortError(): Error {
  const error = new Error('媒体内容哈希计算已取消')
  error.name = 'AbortError'
  return error
}

/** Computes a stable SHA-256 identity without loading the whole media file into memory. */
export async function createMediaContentHash(filePath: string, options: { signal?: AbortSignal } = {}): Promise<string> {
  const initialStat = await stat(filePath)
  if (!initialStat.isFile()) throw new Error('媒体路径不是文件')
  if (options.signal?.aborted) throw createAbortError()

  const hash = createHash('sha256')
  const stream = createReadStream(filePath, { highWaterMark: CONTENT_HASH_CHUNK_BYTES })
  try {
    for await (const chunk of stream) {
      if (options.signal?.aborted) throw createAbortError()
      hash.update(chunk)
    }
  } finally {
    stream.destroy()
  }

  const finalStat = await stat(filePath)
  if (finalStat.size !== initialStat.size || finalStat.mtimeMs !== initialStat.mtimeMs) throw new Error('媒体在哈希计算期间发生变化')
  return hash.digest('hex')
}
