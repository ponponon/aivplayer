import { createWriteStream } from 'node:fs'
import { access, mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises'
import { constants } from 'node:fs'
import { Readable } from 'node:stream'
import { pipeline } from 'node:stream/promises'
import { dirname, join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import {
  VISION_MODEL_DIRECTORY,
  VISION_MODEL_FILES,
  VISION_MODEL_REPOSITORY,
  VISION_MODEL_REVISION
} from './write-runtime-metadata.ts'

const DEFAULT_BASE_URL = 'https://huggingface.co'

export type VisionModelFetch = (input: string, init?: RequestInit) => Promise<Response>

export type PrepareVisionModelOptions = {
  resourcePath?: string
  repository?: string
  revision?: string
  fetchImpl?: VisionModelFetch
}

export type PrepareVisionModelResult = {
  ok: true
  resourcePath: string
  modelDirectory: string
  repository: string
  revision: string
  downloaded: string[]
  message: string
}

function buildDownloadUrl(repository: string, revision: string, relativePath: string): string {
  const encodedPath = relativePath.split('/').map((part) => encodeURIComponent(part)).join('/')
  return `${DEFAULT_BASE_URL}/${repository}/resolve/${revision}/${encodedPath}`
}

async function pathExists(filePath: string): Promise<boolean> {
  try {
    await access(filePath, constants.F_OK)
    return true
  } catch {
    return false
  }
}

async function downloadFile(url: string, filePath: string, fetchImpl: VisionModelFetch): Promise<void> {
  const response = await fetchImpl(url, { redirect: 'follow' })
  if (!response.ok || !response.body) throw new Error(`Failed to download vision model file (${response.status}): ${url}`)
  const temporaryPath = `${filePath}.${process.pid}.download`
  await rm(temporaryPath, { force: true })
  try {
    await pipeline(
      Readable.fromWeb(response.body as import('node:stream/web').ReadableStream<Uint8Array>),
      createWriteStream(temporaryPath)
    )
    await rename(temporaryPath, filePath)
  } catch (error) {
    await rm(temporaryPath, { force: true })
    throw error
  }
}

export async function prepareVisionModel(options: PrepareVisionModelOptions = {}): Promise<PrepareVisionModelResult> {
  const resourcePath = resolve(options.resourcePath ?? process.env.AIVPLAYER_RESOURCE_DIR ?? 'resources')
  const repository = options.repository ?? process.env.VISION_MODEL_REPOSITORY ?? VISION_MODEL_REPOSITORY
  const revision = options.revision ?? process.env.VISION_MODEL_REVISION ?? VISION_MODEL_REVISION
  const fetchImpl = options.fetchImpl ?? fetch
  const modelDirectory = join(resourcePath, VISION_MODEL_DIRECTORY)
  const markerPath = join(modelDirectory, '.aivplayer-model-revision')
  await mkdir(modelDirectory, { recursive: true })

  const marker = await readFile(markerPath, 'utf8').catch(() => '')
  const canReuseExistingFiles = marker.trim() === `${repository}\n${revision}`
  const downloaded: string[] = []
  for (const relativePath of VISION_MODEL_FILES) {
    const filePath = join(modelDirectory, relativePath)
    await mkdir(dirname(filePath), { recursive: true })
    if (canReuseExistingFiles && await pathExists(filePath)) continue
    await downloadFile(buildDownloadUrl(repository, revision, relativePath), filePath, fetchImpl)
    downloaded.push(relativePath)
  }
  await writeFile(join(modelDirectory, '.aivplayer-model-revision'), `${repository}\n${revision}\n`, 'utf8')

  return {
    ok: true,
    resourcePath,
    modelDirectory,
    repository,
    revision,
    downloaded,
    message: downloaded.length > 0
      ? `Vision model staged: ${downloaded.length} file(s) downloaded to ${modelDirectory}`
      : `Vision model already staged: ${modelDirectory}`
  }
}

function readOptions(argv: string[]): PrepareVisionModelOptions {
  const options: PrepareVisionModelOptions = {}
  for (let index = 0; index < argv.length; index += 1) {
    const item = argv[index]
    const value = argv[index + 1]
    if (!value || value.startsWith('--')) continue
    if (item === '--resource-dir') options.resourcePath = value
    else if (item === '--repository') options.repository = value
    else if (item === '--revision') options.revision = value
    else continue
    index += 1
  }
  return options
}

async function main(): Promise<void> {
  const result = await prepareVisionModel(readOptions(process.argv.slice(2)))
  console.log(result.message)
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  void main().catch((error) => {
    console.error(error instanceof Error ? error.message : error)
    process.exitCode = 1
  })
}
