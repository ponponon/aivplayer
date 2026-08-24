import { join } from 'node:path'
import { PERSON_MATTE_MODEL_FILES, getPersonMatteModelPaths, type PersonMatteModelFile, type PersonMatteModelPaths } from './person-matte-model'
import { downloadVerifiedFile, getVerifiedFileSize, invalidateFileCache } from './model-download-utils'
import type { PersonMatteModelDownloadProgress } from '../../shared/person-matte-types'

export type { PersonMatteModelDownloadProgress } from '../../shared/person-matte-types'

export type DownloadPersonMatteModelOptions = {
  modelRoot: string
  files?: readonly PersonMatteModelFile[]
  fetchImpl?: typeof fetch
  signal?: AbortSignal
  onProgress?: (progress: PersonMatteModelDownloadProgress) => void
}

export async function downloadPersonMatteModel(options: DownloadPersonMatteModelOptions): Promise<PersonMatteModelPaths> {
  const paths = getPersonMatteModelPaths(options.modelRoot)
  const fetchImpl = options.fetchImpl ?? fetch
  const files = options.files ?? PERSON_MATTE_MODEL_FILES

  for (const [index, file] of files.entries()) {
    const targetPath = join(paths.modelDirectory, file.relativePath)
    const expected = file.expected
    const cachedSize = await getVerifiedFileSize(targetPath, expected ?? {})
    if (cachedSize !== null && cachedSize > 0) {
      emitProgress(options.onProgress, {
        status: 'cached',
        relativePath: file.relativePath,
        fileIndex: index + 1,
        fileCount: files.length,
        receivedBytes: cachedSize,
        totalBytes: cachedSize,
        percent: 1
      })
      continue
    }

    await invalidateFileCache(targetPath)
    try {
      const result = await downloadVerifiedFile({
        url: file.url,
        targetPath,
        expected,
        fetchImpl,
        signal: options.signal,
        onProgress: ({ receivedBytes, totalBytes }) => {
          const effectiveTotalBytes = totalBytes ?? expected?.sizeBytes ?? null
          emitProgress(options.onProgress, {
            status: 'downloading',
            relativePath: file.relativePath,
            fileIndex: index + 1,
            fileCount: files.length,
            receivedBytes,
            totalBytes: effectiveTotalBytes,
            percent: toPercent(receivedBytes, effectiveTotalBytes)
          })
        }
      })
      emitProgress(options.onProgress, {
        status: 'completed',
        relativePath: file.relativePath,
        fileIndex: index + 1,
        fileCount: files.length,
        receivedBytes: result.sizeBytes,
        totalBytes: result.sizeBytes,
        percent: 1
      })
    } catch (error) {
      await invalidateFileCache(targetPath)
      const reason = error instanceof Error ? error.message : String(error)
      throw new Error(`人物抠像模型下载失败：${file.relativePath}，${reason}`)
    }
  }

  return paths
}

function emitProgress(onProgress: DownloadPersonMatteModelOptions['onProgress'], progress: PersonMatteModelDownloadProgress): void {
  onProgress?.(progress)
}

function toPercent(receivedBytes: number, totalBytes: number | null): number | null {
  return totalBytes && totalBytes > 0 ? Math.min(1, receivedBytes / totalBytes) : null
}
