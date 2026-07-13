import { copyFile, mkdir, readdir, realpath, stat, unlink } from 'node:fs/promises'
import { basename, dirname, join, normalize } from 'node:path'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'

const execFileAsync = promisify(execFile)
const OTOOL_PATH = '/usr/bin/otool'
const INSTALL_NAME_TOOL_PATH = '/usr/bin/install_name_tool'
const CODESIGN_PATH = '/usr/bin/codesign'
const FILE_PATH = '/usr/bin/file'
const MACHO_OUTPUT_LIMIT = 2 * 1024 * 1024
const SYSTEM_LIBRARY_PREFIXES = ['/System/Library/', '/System/Volumes/', '/usr/lib/']
const RUNTIME_SIDECAR_EXTENSIONS = new Set(['.dll', '.dylib', '.metal'])

type MachODependency = {
  reference: string
  resolvedPath: string | null
  external: boolean
}

type MachOFile = {
  sourcePath: string
  destinationPath: string
  dependencies: MachODependency[]
  isDynamicLibrary: boolean
}

export type BundleMachODependenciesOptions = {
  entries: Array<{
    sourcePath: string
    destinationPath: string
  }>
  destinationDirectory: string
  platform?: NodeJS.Platform
}

export type BundleMachODependenciesResult = {
  copiedFiles: string[]
  dependencyCount: number
}

function isSystemLibrary(path: string): boolean {
  const normalizedPath = normalize(path)
  return SYSTEM_LIBRARY_PREFIXES.some((prefix) => normalizedPath.startsWith(prefix))
}

function expandPathToken(path: string, filePath: string, executableDirectory: string): string {
  if (path.startsWith('@loader_path/')) {
    return join(dirname(filePath), path.slice('@loader_path/'.length))
  }

  if (path.startsWith('@executable_path/')) {
    return join(executableDirectory, path.slice('@executable_path/'.length))
  }

  return path
}

async function pathExists(path: string): Promise<boolean> {
  try {
    await stat(path)
    return true
  } catch {
    return false
  }
}

async function readMachOOutput(args: string[]): Promise<string> {
  const result = await execFileAsync(OTOOL_PATH, args, {
    maxBuffer: MACHO_OUTPUT_LIMIT
  })
  return result.stdout
}

async function isMachOFile(filePath: string): Promise<boolean> {
  try {
    const result = await execFileAsync(FILE_PATH, ['-b', filePath], {
      maxBuffer: 32 * 1024
    })
    return result.stdout.includes('Mach-O')
  } catch {
    return false
  }
}

function parseMachODependencies(output: string): string[] {
  return output
    .split('\n')
    .slice(1)
    .map((line) => line.trim().split(' (compatibility version')[0])
    .filter(Boolean)
}

function parseMachORpaths(output: string): string[] {
  const rpaths: string[] = []
  const lines = output.split('\n')

  for (let index = 0; index < lines.length; index += 1) {
    if (!lines[index]?.includes('cmd LC_RPATH')) {
      continue
    }

    for (let offset = index + 1; offset < Math.min(lines.length, index + 6); offset += 1) {
      const match = lines[offset]?.match(/^\s*path (.+) \(offset /)
      if (match?.[1]) {
        rpaths.push(match[1])
        break
      }
    }
  }

  return rpaths
}

async function readMachOFileInfo(filePath: string): Promise<{
  dependencies: string[]
  rpaths: string[]
  isDynamicLibrary: boolean
}> {
  const [loadCommands, fileDescription] = await Promise.all([
    readMachOOutput(['-l', filePath]),
    execFileAsync(FILE_PATH, ['-b', filePath], { maxBuffer: 32 * 1024 })
  ])
  const dependencies = parseMachODependencies(await readMachOOutput(['-L', filePath]))

  return {
    dependencies,
    rpaths: parseMachORpaths(loadCommands),
    isDynamicLibrary: fileDescription.stdout.includes('dynamically linked shared library')
  }
}

async function resolveMachODependency(
  reference: string,
  filePath: string,
  executableDirectory: string,
  rpaths: string[]
): Promise<string | null> {
  const candidates = reference.startsWith('@rpath/')
    ? rpaths.map((rpath) => join(expandPathToken(rpath, filePath, executableDirectory), reference.slice('@rpath/'.length)))
    : [expandPathToken(reference, filePath, executableDirectory)]

  for (const candidate of candidates) {
    if (await pathExists(candidate)) {
      return realpath(candidate)
    }
  }

  return null
}

async function rewriteMachOFile(file: MachOFile, destinationsBySource: Map<string, string>): Promise<void> {
  const args: string[] = []

  if (file.isDynamicLibrary) {
    args.push('-id', `@loader_path/${basename(file.destinationPath)}`)
  }

  for (const dependency of file.dependencies) {
    if (!dependency.external || !dependency.resolvedPath) {
      continue
    }

    const destinationPath = destinationsBySource.get(dependency.resolvedPath)
    if (!destinationPath) {
      throw new Error(`Missing staged Mach-O dependency for ${dependency.resolvedPath}`)
    }

    args.push('-change', dependency.reference, `@loader_path/${basename(destinationPath)}`)
  }

  if (args.length === 0) {
    return
  }

  await execFileAsync(INSTALL_NAME_TOOL_PATH, [...args, file.destinationPath], {
    maxBuffer: MACHO_OUTPUT_LIMIT
  })
  await execFileAsync(CODESIGN_PATH, ['--force', '--sign', '-', '--timestamp=none', file.destinationPath], {
    maxBuffer: MACHO_OUTPUT_LIMIT
  })
}

export async function clearRuntimeSidecars(directory: string): Promise<void> {
  const entries = await readdir(directory, { withFileTypes: true }).catch(() => [])

  await Promise.all(
    entries
      .filter((entry) => entry.isFile() && RUNTIME_SIDECAR_EXTENSIONS.has(entry.name.slice(entry.name.lastIndexOf('.')).toLowerCase()))
      .map((entry) => unlink(join(directory, entry.name)))
  )
}

export async function bundleMachODependencies(
  options: BundleMachODependenciesOptions
): Promise<BundleMachODependenciesResult> {
  if (options.platform !== 'darwin' && options.platform !== undefined) {
    return { copiedFiles: [], dependencyCount: 0 }
  }

  const entries: MachOFile[] = []
  const pending: Array<{ sourcePath: string; destinationPath: string }> = []

  for (const entry of options.entries) {
    const sourcePath = await realpath(entry.sourcePath)
    if (await isMachOFile(sourcePath)) {
      pending.push({ sourcePath, destinationPath: entry.destinationPath })
    }
  }

  if (pending.length === 0) {
    return { copiedFiles: [], dependencyCount: 0 }
  }

  const executableDirectory = dirname(pending[0].sourcePath)
  const visited = new Set<string>()
  const destinationsBySource = new Map<string, string>(
    pending.map((entry) => [entry.sourcePath, entry.destinationPath])
  )

  while (pending.length > 0) {
    const current = pending.shift()
    if (!current || visited.has(current.sourcePath)) {
      continue
    }

    visited.add(current.sourcePath)
    const info = await readMachOFileInfo(current.sourcePath)
    const dependencies: MachODependency[] = []

    for (const reference of info.dependencies) {
      const resolvedPath = await resolveMachODependency(
        reference,
        current.sourcePath,
        executableDirectory,
        info.rpaths
      )
      if (!resolvedPath && !isSystemLibrary(reference)) {
        throw new Error(`Could not resolve external Mach-O dependency ${reference} from ${current.sourcePath}`)
      }

      const external = Boolean(resolvedPath && !isSystemLibrary(resolvedPath))

      dependencies.push({ reference, resolvedPath, external })

      if (external && resolvedPath) {
        const destinationPath = join(options.destinationDirectory, basename(resolvedPath))
        const existingDestination = destinationsBySource.get(resolvedPath)
        if (existingDestination && existingDestination !== destinationPath) {
          throw new Error(`Conflicting staged destination for Mach-O dependency ${resolvedPath}`)
        }

        destinationsBySource.set(resolvedPath, destinationPath)
        if (!visited.has(resolvedPath)) {
          pending.push({ sourcePath: resolvedPath, destinationPath })
        }
      }
    }

    entries.push({
      sourcePath: current.sourcePath,
      destinationPath: current.destinationPath,
      dependencies,
      isDynamicLibrary: info.isDynamicLibrary
    })
  }

  await mkdir(options.destinationDirectory, { recursive: true })

  const copiedFiles = new Set<string>()
  for (const [sourcePath, destinationPath] of destinationsBySource) {
    if (sourcePath === destinationPath) {
      continue
    }

    await copyFile(sourcePath, destinationPath)
    copiedFiles.add(destinationPath)
  }

  for (const entry of entries) {
    await rewriteMachOFile(entry, destinationsBySource)
  }

  return {
    copiedFiles: [...copiedFiles],
    dependencyCount: copiedFiles.size
  }
}
