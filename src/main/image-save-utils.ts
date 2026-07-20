import { access } from 'node:fs/promises'
import { basename, extname, join } from 'node:path'

export function sanitizeImageExtension(extension: string): string {
  return extension.trim().toLowerCase().replace(/[^a-z0-9]/g, '') || 'png'
}

export function sanitizeImageFileName(fileName: string, extension: string): string {
  const safeExtension = sanitizeImageExtension(extension)
  const safeName = basename(fileName).replace(/[^\w.\-\u4e00-\u9fff]/g, '_')
  return safeName || `aivplayer-image.${safeExtension}`
}

export async function findAvailableImagePath(directoryPath: string, fileName: string): Promise<string> {
  const extension = extname(fileName)
  const stem = extension ? fileName.slice(0, -extension.length) : fileName
  let candidate = join(directoryPath, fileName)
  let index = 2
  while (true) {
    try {
      await access(candidate)
      candidate = join(directoryPath, `${stem}-${index}${extension}`)
      index += 1
    } catch {
      return candidate
    }
  }
}
