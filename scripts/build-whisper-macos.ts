import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { access, mkdir, readdir, readlink, stat, symlink } from 'node:fs/promises'
import { constants } from 'node:fs'
import { basename, join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { prepareAsrRuntime, type PrepareAsrRuntimeOptions } from './prepare-asr-runtime.ts'
import { getWhisperBinaryNames as getSupportedWhisperBinaryNames } from '../src/core/ai/whisper-binary.ts'

const execFileAsync = promisify(execFile)

const WHISPER_CPP_REPO = 'https://github.com/ggml-org/whisper.cpp.git'
const DEFAULT_TAG = 'v1.9.1'
const CACHE_DIR = join(process.env.HOME ?? '~', '.cache', 'aivplayer', 'whisper.cpp')

type BuildWhisperMacosOptions = {
  sourceDir?: string
  tag?: string
  buildDir?: string
  jobs?: number
  skipClone?: boolean
}

async function pathExists(filePath: string): Promise<boolean> {
  try {
    await access(filePath, constants.F_OK)
    return true
  } catch {
    return false
  }
}

async function isDirectory(filePath: string): Promise<boolean> {
  try {
    const fileStat = await stat(filePath)
    return fileStat.isDirectory()
  } catch {
    return false
  }
}

async function findWhisperBinaryPath(binDir: string): Promise<string | null> {
  for (const binaryName of getSupportedWhisperBinaryNames()) {
    const candidatePath = join(binDir, binaryName)

    if (await pathExists(candidatePath)) {
      return candidatePath
    }
  }

  return null
}

function parseArgs(argv: string[]): BuildWhisperMacosOptions {
  const options: BuildWhisperMacosOptions = {}

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i]
    const next = argv[i + 1]

    if (!next || next.startsWith('--')) {
      continue
    }

    if (arg === '--source-dir') {
      options.sourceDir = next
      i += 1
    } else if (arg === '--tag') {
      options.tag = next
      i += 1
    } else if (arg === '--build-dir') {
      options.buildDir = next
      i += 1
    } else if (arg === '--jobs') {
      options.jobs = parseInt(next, 10)
      i += 1
    }
  }

  if (argv.includes('--skip-clone')) {
    options.skipClone = true
  }

  return options
}

async function cloneOrCheckout(sourceDir: string, tag: string): Promise<void> {
  if (await pathExists(join(sourceDir, '.git'))) {
    console.log(`[build-whisper] source exists at ${sourceDir}, fetching tag ${tag}...`)
    await execFileAsync('git', ['fetch', '--tags'], { cwd: sourceDir, timeout: 60_000 })
    await execFileAsync('git', ['checkout', tag], { cwd: sourceDir, timeout: 15_000 })
    return
  }

  console.log(`[build-whisper] cloning ${WHISPER_CPP_REPO} (tag ${tag})...`)
  await mkdir(sourceDir, { recursive: true })
  await execFileAsync('git', ['clone', '--depth', '1', '--branch', tag, WHISPER_CPP_REPO, sourceDir], {
    timeout: 120_000
  })
}

async function runCmakeConfigure(sourceDir: string, buildDir: string): Promise<void> {
  console.log(`[build-whisper] cmake configure → ${buildDir}`)
  await execFileAsync(
    'cmake',
    ['-B', buildDir, '-DWHISPER_BUILD_TESTS=OFF', '-DWHISPER_BUILD_EXAMPLES=ON', '-DCMAKE_BUILD_TYPE=Release'],
    { cwd: sourceDir, timeout: 60_000 }
  )
}

async function runCmakeBuild(sourceDir: string, buildDir: string, jobs: number): Promise<void> {
  console.log(`[build-whisper] cmake build (-j${jobs})...`)
  await execFileAsync('cmake', ['--build', buildDir, '-j', String(jobs), '--config', 'Release'], {
    cwd: sourceDir,
    timeout: 600_000
  })
}

async function resolveDylibSymlinks(binDir: string): Promise<void> {
  const entries = await readdir(binDir, { withFileTypes: true })
  const dylibs = entries.filter((e) => e.isFile() && e.name.endsWith('.dylib'))
  const versioned = dylibs.filter((e) => /\.\d+\.\d+\.\d+\.dylib$/.test(e.name))

  for (const file of versioned) {
    const filePath = join(binDir, file.name)
    const content = await readlink(filePath).catch(() => null)

    if (content !== null) {
      continue
    }

    const match = file.name.match(/^(.+?\.\d+)\.\d+\.\d+\.dylib$/)

    if (!match) {
      continue
    }
    const soname = `${match[1]}.dylib`
    const majorPath = join(binDir, match[1] + '.dylib')
    const unversionedPath = join(binDir, match[1].replace(/\.\d+$/, '') + '.dylib')

    if (!(await pathExists(majorPath))) {
      await symlink(file.name, majorPath)
    }

    if (!(await pathExists(unversionedPath))) {
      await symlink(match[1] + '.dylib', unversionedPath)
    }
  }
}

async function createResourceSymlinks(resourceDir: string): Promise<void> {
  const entries = await readdir(resourceDir, { withFileTypes: true })
  const versioned = entries.filter((e) => e.isFile() && /\.\d+\.\d+\.\d+\.dylib$/.test(e.name))

  for (const file of versioned) {
    const match = file.name.match(/^(.+?\.\d+)\.\d+\.\d+\.dylib$/)

    if (!match) {
      continue
    }

    const majorName = `${match[1]}.dylib`
    const majorPath = join(resourceDir, majorName)
    const unversionedName = match[1].replace(/\.\d+$/, '') + '.dylib'
    const unversionedPath = join(resourceDir, unversionedName)

    if (!(await pathExists(majorPath))) {
      await symlink(file.name, majorPath)
    }

    if (!(await pathExists(unversionedPath))) {
      await symlink(majorName, unversionedPath)
    }
  }
}

async function fixRpath(binaryPath: string): Promise<void> {
  try {
    await execFileAsync('install_name_tool', ['-add_rpath', '@executable_path', binaryPath])
  } catch {
    // rpath may already exist
  }

  try {
    await execFileAsync('install_name_tool', ['-add_rpath', '@loader_path', binaryPath])
  } catch {
    // rpath may already exist
  }
}

async function main(): Promise<void> {
  const options = parseArgs(process.argv.slice(2))
  const tag = options.tag ?? DEFAULT_TAG
  const sourceDir = resolve(options.sourceDir ?? CACHE_DIR)
  const buildDir = resolve(options.buildDir ?? join(sourceDir, 'build'))
  const jobs = options.jobs ?? Math.max(1, (await import('node:os')).cpus().length)

  if (!options.skipClone) {
    await cloneOrCheckout(sourceDir, tag)
  } else if (!(await isDirectory(join(sourceDir, 'src')))) {
    throw new Error(`--skip-clone set but source not found at ${sourceDir}`)
  }

  await runCmakeConfigure(sourceDir, buildDir)
  await runCmakeBuild(sourceDir, buildDir, jobs)

  const binDir = join(buildDir, 'bin')
  const whisperBinaryPath = await findWhisperBinaryPath(binDir)

  if (!whisperBinaryPath) {
    throw new Error(`whisper.cpp binary not found in ${binDir}`)
  }

  await resolveDylibSymlinks(binDir)
  await fixRpath(whisperBinaryPath)

  const prepareOptions: PrepareAsrRuntimeOptions = {
    whisperDirectory: binDir,
    ffmpegDirectory: undefined,
    ffmpegBinaryPath: '/opt/homebrew/bin/ffmpeg'
  }

  const result = await prepareAsrRuntime(prepareOptions)
  const whisperResourceDir = join(resolve('resources'), 'whisper.cpp')
  await createResourceSymlinks(whisperResourceDir)

  console.log(`\n[build-whisper] done!`)
  console.log(result.message)
}

void main().catch((error) => {
  console.error(`[build-whisper] failed:`, error instanceof Error ? error.message : error)
  process.exitCode = 1
})
