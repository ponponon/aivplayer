import { readdir } from 'node:fs/promises'
import { basename, join, resolve } from 'node:path'

export const RELEASE_MANIFEST_NAME = 'release-manifest.json'
const UPDATE_METADATA_PATTERN = /^latest(?:-[^/]+)?\.yml$/i

export function isReleaseArtifact(name) {
  return name === RELEASE_MANIFEST_NAME || /\.(?:dmg|zip|exe|AppImage|deb|snap|blockmap)$/i.test(name) || UPDATE_METADATA_PATTERN.test(name)
}

export async function listReleaseArtifacts(directory, options = {}) {
  const root = resolve(directory)
  const includeManifest = options.includeManifest ?? true
  const recursive = options.recursive ?? true
  const files = []

  async function walk(currentDirectory) {
    const entries = await readdir(currentDirectory, { withFileTypes: true })
    for (const entry of entries) {
      const filePath = join(currentDirectory, entry.name)
      if (entry.isDirectory()) {
        // electron-builder 的 snap 构建临时目录不纳入发布产物
        if (entry.name.startsWith('__snap-')) continue
        if (recursive) await walk(filePath)
        continue
      }
      if (!isReleaseArtifact(entry.name)) continue
      if (!includeManifest && basename(filePath) === RELEASE_MANIFEST_NAME) continue
      files.push(filePath)
    }
  }

  await walk(root)
  return files.sort((left, right) => left.localeCompare(right))
}
