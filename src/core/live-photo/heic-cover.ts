import { access, constants, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { delimiter, isAbsolute, join } from 'node:path'
import { tmpdir } from 'node:os'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { mergeJpegCoverMetadata } from './jpeg-cover.ts'

const execFileAsync = promisify(execFile)

export type HeicCoverToolPaths = {
  encoderPath: string | null
  converterPath: string | null
  fallbackEncoderPath?: string | null
  fallbackConverterPath?: string | null
}

function uniquePaths(paths: Array<string | null | undefined>): string[] {
  return Array.from(new Set(paths.filter((path): path is string => typeof path === 'string' && isAbsolute(path))))
}

async function isExecutable(path: string): Promise<boolean> {
  try {
    await access(path, constants.X_OK)
    return true
  } catch {
    return false
  }
}

function getPathCandidates(env: NodeJS.ProcessEnv, names: string[]): string[] {
  return (env.PATH ?? '').split(delimiter).filter(Boolean).flatMap((directory) => names.map((name) => join(directory, name)))
}

function getKnownCandidates(names: string[]): string[] {
  const directories = process.platform === 'darwin'
    ? ['/opt/homebrew/bin', '/usr/local/bin', '/opt/local/bin', '/usr/bin']
    : process.platform === 'win32'
      ? ['C:\\Program Files\\libheif\\bin', 'C:\\ProgramData\\chocolatey\\bin']
      : ['/usr/local/bin', '/usr/bin', '/bin', '/snap/bin']
  return directories.flatMap((directory) => names.map((name) => join(directory, name)))
}

async function firstExecutable(candidates: string[]): Promise<string | null> {
  for (const candidate of uniquePaths(candidates)) if (await isExecutable(candidate)) return candidate
  return null
}

export async function resolveHeicCoverToolPaths(env: NodeJS.ProcessEnv = process.env, resourcePath?: string): Promise<HeicCoverToolPaths> {
  const sipsPath = process.platform === 'darwin' ? await firstExecutable(uniquePaths(['/usr/bin/sips', env.AIVPLAYER_SIPS_BIN])) : null
  const bundledDirectory = resourcePath ? join(resourcePath, 'heif') : null
  const heifEncoderPath = await firstExecutable(uniquePaths([
    env.AIVPLAYER_HEIF_ENC,
    bundledDirectory ? join(bundledDirectory, 'heif-enc') : null,
    bundledDirectory ? join(bundledDirectory, 'heif-enc.exe') : null,
    ...getKnownCandidates(['heif-enc', 'heif-enc.exe']),
    ...getPathCandidates(env, ['heif-enc', 'heif-enc.exe'])
  ]))
  const heifConverterPath = await firstExecutable(uniquePaths([
    env.AIVPLAYER_HEIF_CONVERT,
    bundledDirectory ? join(bundledDirectory, 'heif-convert') : null,
    bundledDirectory ? join(bundledDirectory, 'heif-convert.exe') : null,
    ...getKnownCandidates(['heif-convert', 'heif-convert.exe']),
    ...getPathCandidates(env, ['heif-convert', 'heif-convert.exe'])
  ]))
  return {
    encoderPath: sipsPath ?? heifEncoderPath,
    converterPath: sipsPath ?? heifConverterPath,
    fallbackEncoderPath: sipsPath ? heifEncoderPath : null,
    fallbackConverterPath: sipsPath ? heifConverterPath : null
  }
}

function isSips(path: string): boolean {
  return path.toLowerCase().endsWith('/sips')
}

async function convertHeicToMetadataJpeg(options: { converterPath: string; sourcePath: string; outputPath: string }): Promise<void> {
  if (isSips(options.converterPath)) {
    await execFileAsync(options.converterPath, ['-s', 'format', 'jpeg', options.sourcePath, '--out', options.outputPath], { maxBuffer: 2 * 1024 * 1024 })
    return
  }
  await execFileAsync(options.converterPath, [options.sourcePath, options.outputPath], { maxBuffer: 2 * 1024 * 1024 })
}

async function encodeJpegToHeic(options: { encoderPath: string; sourcePath: string; outputPath: string }): Promise<void> {
  if (isSips(options.encoderPath)) {
    await execFileAsync(options.encoderPath, ['-s', 'format', 'heic', options.sourcePath, '--out', options.outputPath], { maxBuffer: 2 * 1024 * 1024 })
    return
  }
  await execFileAsync(options.encoderPath, ['-q', '90', '-o', options.outputPath, options.sourcePath], { maxBuffer: 2 * 1024 * 1024 })
}

export async function encodeHeicCover(options: {
  sourcePath: string
  renderedJpeg: Buffer
  outputPath: string
  tools: HeicCoverToolPaths
}): Promise<void> {
  const converterPaths = uniquePaths([options.tools.converterPath, options.tools.fallbackConverterPath])
  const encoderPaths = uniquePaths([options.tools.encoderPath, options.tools.fallbackEncoderPath])
  if (converterPaths.length === 0 || encoderPaths.length === 0) throw new Error('编辑 HEIC 封面需要 macOS sips 或 libheif 的 heif-enc/heif-convert')
  const tempDir = await mkdtemp(join(tmpdir(), 'aivplayer-heic-cover-'))
  try {
    const metadataJpegPath = join(tempDir, 'metadata-donor.jpg')
    const mergedJpegPath = join(tempDir, 'merged-cover.jpg')
    const encodedHeicPath = join(tempDir, 'encoded-cover.heic')
    let lastConverterError: unknown = null
    for (const converterPath of converterPaths) {
      try {
        await convertHeicToMetadataJpeg({ converterPath, sourcePath: options.sourcePath, outputPath: metadataJpegPath })
        lastConverterError = null
        break
      } catch (error) {
        lastConverterError = error
      }
    }
    if (lastConverterError) throw lastConverterError
    const metadataJpeg = await readFile(metadataJpegPath)
    await writeFile(mergedJpegPath, mergeJpegCoverMetadata(metadataJpeg, options.renderedJpeg))
    let lastEncoderError: unknown = null
    for (const encoderPath of encoderPaths) {
      try {
        await encodeJpegToHeic({ encoderPath, sourcePath: mergedJpegPath, outputPath: encodedHeicPath })
        lastEncoderError = null
        break
      } catch (error) {
        lastEncoderError = error
      }
    }
    if (lastEncoderError) throw lastEncoderError
    await writeFile(options.outputPath, await readFile(encodedHeicPath))
  } finally {
    await rm(tempDir, { recursive: true, force: true }).catch(() => {})
  }
}

export function isHeicPath(path: string): boolean {
  const extension = path.slice(path.lastIndexOf('.')).toLowerCase()
  return extension === '.heic' || extension === '.heif'
}
