import { readdir, stat } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'

const execFileAsync = promisify(execFile)
const modelDirectory = resolve(process.env.VISION_MODEL_DIR ?? 'resources/vision/siglip2-base-patch16-224-ONNX')
const modelRevision = process.env.VISION_MODEL_REVISION ?? 'ba1f3b0843f24bc5417d38e19c37b287d719b2f4'
const bucket = process.env.R2_BUCKET ?? 'aivplayer-releases'
const modelPrefix = `aivplayer/models/siglip2/${modelRevision}`
const manifestPath = resolve(process.env.VISION_MODEL_MANIFEST ?? 'resources/vision-model-manifest.json')
const modelFiles = new Set([
  'config.json',
  'preprocessor_config.json',
  'quantize_config.json',
  'special_tokens_map.json',
  'tokenizer.json',
  'tokenizer.model',
  'tokenizer_config.json',
  'onnx/text_model_uint8.onnx',
  'onnx/vision_model_uint8.onnx'
])

const contentTypes = new Map([
  ['.json', 'application/json'],
  ['.model', 'application/octet-stream'],
  ['.onnx', 'application/octet-stream']
])

async function upload(filePath, key) {
  const extension = key.slice(key.lastIndexOf('.'))
  const args = ['r2', 'object', 'put', `${bucket}/${key}`, '--remote', '--file', filePath, '--force', '--cache-control', 'public, max-age=31536000, immutable']
  const type = contentTypes.get(extension)
  if (type) args.push('--content-type', type)
  await execFileAsync('wrangler', args, { timeout: 600_000, maxBuffer: 2 * 1024 * 1024 })
  console.log(`Uploaded ${key} (${(await stat(filePath)).size} bytes)`)
}

async function walk(directory, prefix = '') {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const filePath = join(directory, entry.name)
    const key = `${prefix}${entry.name}`
    if (entry.isDirectory() && entry.name !== '.cache') await walk(filePath, `${key}/`)
    else if (!entry.isDirectory() && !entry.name.startsWith('.') && modelFiles.has(key)) await upload(filePath, `${modelPrefix}/${key}`)
  }
}

await walk(modelDirectory)
await upload(manifestPath, `${modelPrefix}/manifest.json`)
