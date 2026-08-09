import { readdir } from 'node:fs/promises'
import { basename, join, resolve } from 'node:path'

export const RELEASE_MANIFEST_NAME = 'release-manifest.json'

export function isReleaseArtifact(name) {
  return name === RELEASE_MANIFEST_NAME || /\.(?:dmg|zip|pkg|exe|AppImage|deb|yml|blockmap)$/i.test(name)
}

export async function listReleaseArtifacts(directory, options = {}) {
  const root = resolve(directory)
  const includeManifest = options.includeManifest ?? true
  const files = []

  async function walk(currentDirectory) {
    const entries = await readdir(currentDirectory, { withFileTypes: true })
    for (const entry of entries) {
      const filePath = join(currentDirectory, entry.name)
      if (entry.isDirectory()) {
        await walk(filePath)
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
