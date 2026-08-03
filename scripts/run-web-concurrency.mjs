import { execFile, spawn } from 'node:child_process'
import { rm } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { promisify } from 'node:util'
import { join } from 'node:path'

const execFileAsync = promisify(execFile)
const projectRoot = fileURLToPath(new URL('..', import.meta.url))
const esbuildEntry = join(projectRoot, 'node_modules', 'esbuild', 'bin', process.platform === 'win32' ? 'esbuild.exe' : 'esbuild')
const generatedEntry = join(projectRoot, '.aivplayer-web-concurrency.generated.mjs')

try {
  await execFileAsync(esbuildEntry, [
    join(projectRoot, 'scripts', 'smoke-web-concurrency.ts'),
    '--bundle',
    '--platform=node',
    '--format=esm',
    '--packages=external',
    `--outfile=${generatedEntry}`
  ], { cwd: projectRoot, maxBuffer: 2 * 1024 * 1024 })

  const exitCode = await new Promise((resolvePromise, rejectPromise) => {
    const child = spawn(process.execPath, [generatedEntry, ...process.argv.slice(2)], {
      cwd: projectRoot,
      stdio: 'inherit'
    })
    child.once('error', rejectPromise)
    child.once('exit', (code, signal) => resolvePromise(code ?? (signal ? 1 : 0)))
  })
  process.exitCode = Number(exitCode)
} finally {
  await rm(generatedEntry, { force: true })
}
