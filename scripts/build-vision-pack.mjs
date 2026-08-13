import { cp, mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises'
import { readFileSync } from 'node:fs'
import { basename, join, resolve, dirname } from 'node:path'
const projectRoot = resolve(process.cwd())
const outputDirectory = resolve(process.env.VISION_PACK_OUTPUT_DIR ?? 'resources/vision-pack')
const packageNames = ['@huggingface/transformers', '@lancedb/lancedb', 'apache-arrow']
const excludedPackages = new Set(['onnxruntime-web', '@types/node', '@types/command-line-args', '@types/command-line-usage'])

function packageJsonPath(packageName, fromDirectory) {
  let directory = resolve(fromDirectory)
  while (true) {
    const candidate = join(directory, 'node_modules', packageName, 'package.json')
    try {
      const metadata = JSON.parse(readFileSync(candidate, 'utf8'))
      if (metadata.name === packageName) return candidate
    } catch {
      // Continue walking up through the dependency tree.
    }
    const parent = dirname(directory)
    if (parent === directory) break
    directory = parent
  }
  return null
}

async function copyPackageTree(packageName, fromDirectory, copied = new Set()) {
  const sourcePackageJson = packageJsonPath(packageName, fromDirectory)
  if (!sourcePackageJson) throw new Error(`Vision Pack dependency is missing: ${packageName} from ${fromDirectory}`)
  const sourceDirectory = dirname(sourcePackageJson)
  const targetDirectory = join(outputDirectory, 'node_modules', packageName)
  const key = `${packageName}:${sourceDirectory}`
  if (copied.has(key)) return
  copied.add(key)
  await mkdir(dirname(targetDirectory), { recursive: true })
  await cp(sourceDirectory, targetDirectory, { recursive: true, dereference: true, force: true, filter: (source) => {
    const name = source.split('/').pop() ?? ''
    return name !== '.cache' && name !== 'src' && name !== 'node_modules' && !name.endsWith('.tsbuildinfo')
  } })

  const metadata = JSON.parse(await readFile(sourcePackageJson, 'utf8'))
  const dependencies = {
    ...(metadata.dependencies ?? {}),
    ...(packageName === '@lancedb/lancedb'
      ? Object.fromEntries(Object.entries(metadata.optionalDependencies ?? {}).filter(([name]) => name.startsWith('@lancedb/lancedb-')))
      : (metadata.optionalDependencies ?? {}))
  }
  const optionalDependencies = new Set(Object.keys(metadata.optionalDependencies ?? {}))
  for (const dependencyName of Object.keys(dependencies)) {
    if (excludedPackages.has(dependencyName)) continue
    if (!packageJsonPath(dependencyName, sourceDirectory) && optionalDependencies.has(dependencyName)) continue
    await copyPackageTree(dependencyName, sourceDirectory, copied)
  }
  for (const dependencyName of Object.keys(metadata.peerDependencies ?? {})) {
    if (packageJsonPath(dependencyName, sourceDirectory)) await copyPackageTree(dependencyName, sourceDirectory, copied)
  }
}

async function prunePlatformFiles() {
  const platform = process.platform
  const arch = process.arch
  const onnxRoot = join(outputDirectory, 'node_modules', 'onnxruntime-node', 'bin', 'napi-v6')
  try {
    for (const entry of await readdir(onnxRoot)) {
      if (entry !== platform) await rm(join(onnxRoot, entry), { recursive: true, force: true })
    }
    for (const entry of await readdir(join(onnxRoot, platform))) {
      if (entry !== arch) await rm(join(onnxRoot, platform, entry), { recursive: true, force: true })
    }
  } catch {
    // A platform may not use onnxruntime-node in a test fixture.
  }

  const platformPackagePatterns = [
    /^@lancedb\/lancedb-(darwin|linux|win32)-/u,
    /^@img\/(sharp|sharp-libvips)-/u
  ]
  async function pruneNodeModules(directory) {
    let entries = []
    try { entries = await readdir(directory, { withFileTypes: true }) } catch { return }
    for (const entry of entries) {
      const entryPath = join(directory, entry.name)
      if (!entry.isDirectory()) continue
      let packageName = entry.name
      try {
        packageName = JSON.parse(await readFile(join(entryPath, 'package.json'), 'utf8')).name ?? packageName
      } catch {
        // Traverse non-package directories such as node_modules.
      }
      if (platformPackagePatterns.some((pattern) => pattern.test(packageName))) {
        const isCurrent = packageName.includes(`-${platform}-`) || packageName.includes(`-${platform}-${arch}`) || (platform === 'darwin' && packageName.includes('-darwin-')) || (platform === 'linux' && packageName.includes('-linux-')) || (platform === 'win32' && packageName.includes('-win32-'))
        if (!isCurrent) {
          await rm(entryPath, { recursive: true, force: true })
          continue
        }
      }
      await pruneNodeModules(entryPath)
    }
  }
  await pruneNodeModules(join(outputDirectory, 'node_modules'))
}

async function removeUnneededFiles() {
  async function walk(directory) {
    let entries = []
    try { entries = await readdir(directory, { withFileTypes: true }) } catch { return }
    for (const entry of entries) {
      const entryPath = join(directory, entry.name)
      if (entry.isDirectory()) await walk(entryPath)
      else if (entry.name.endsWith('.map') || entry.name === 'README.md') await rm(entryPath, { force: true })
    }
  }
  await walk(outputDirectory)
}

async function main() {
  await rm(outputDirectory, { recursive: true, force: true })
  await mkdir(outputDirectory, { recursive: true })
  const copied = new Set()
  for (const packageName of packageNames) await copyPackageTree(packageName, projectRoot, copied)
  await prunePlatformFiles()
  await removeUnneededFiles()
  const packageJson = {
    name: 'aivplayer-vision-pack',
    version: process.env.npm_package_version ?? '0.5.5',
    private: true,
    main: 'node_modules/@lancedb/lancedb/dist/index.js'
  }
  await writeFile(join(outputDirectory, 'package.json'), `${JSON.stringify(packageJson, null, 2)}\n`)
  const manifest = {
    id: 'aivplayer-vision-pack',
    version: packageJson.version,
    platform: process.platform,
    arch: process.arch,
    entry: 'package.json',
    packages: packageNames
  }
  await writeFile(join(outputDirectory, 'vision-pack.json'), `${JSON.stringify(manifest, null, 2)}\n`)
  console.log(`Vision Pack prepared: ${outputDirectory}`)
}

await main()
