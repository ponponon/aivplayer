import { createHash } from 'node:crypto'
import { mkdir, readFile, stat, writeFile } from 'node:fs/promises'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { join, resolve } from 'node:path'

const execFileAsync = promisify(execFile)
const packDirectory = resolve(process.env.VISION_PACK_OUTPUT_DIR ?? 'resources/vision-pack')
const archiveDirectory = resolve(process.env.VISION_PACK_ARCHIVE_DIR ?? 'release/vision-pack')
const archiveName = 'vision-pack.tar.gz'
const archivePath = join(archiveDirectory, archiveName)

await mkdir(archiveDirectory, { recursive: true })
await execFileAsync('tar', ['-czf', archivePath, '-C', packDirectory, '.'], { timeout: 300_000 })
const content = await readFile(archivePath)
const metadata = JSON.parse(await readFile(join(packDirectory, 'vision-pack.json'), 'utf8'))
const manifest = {
  ...metadata,
  archive: archiveName,
  sha256: createHash('sha256').update(content).digest('hex'),
  sizeBytes: (await stat(archivePath)).size
}
await writeFile(join(archiveDirectory, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`)
console.log(JSON.stringify({ archivePath, manifest }, null, 2))
