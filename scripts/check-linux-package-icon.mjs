import { execFile } from 'node:child_process'
import { promisify } from 'node:util'

const execFileAsync = promisify(execFile)

function readPackagePath(argv) {
  const index = argv.indexOf('--package')
  const value = index >= 0 ? argv[index + 1] : undefined
  if (!value || value.startsWith('--')) throw new Error('Usage: node scripts/check-linux-package-icon.mjs --package <file.deb>')
  return value
}

const packagePath = readPackagePath(process.argv.slice(2))
const { stdout } = await execFileAsync('dpkg-deb', ['--contents', packagePath], { maxBuffer: 1024 * 1024 })
const entries = stdout.split(/\r?\n/u)
const iconEntry = './usr/share/icons/hicolor/512x512/apps/aivplayer.png'

if (!entries.some((entry) => entry.trimEnd().endsWith(iconEntry))) {
  throw new Error(`Linux package is missing the hicolor 512x512 application icon: ${iconEntry}`)
}

console.log(`Linux package icon verified: ${packagePath} contains ${iconEntry}`)
