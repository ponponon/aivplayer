import { createHash } from 'node:crypto'
import { cp, mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises'
import { readFileSync } from 'node:fs'
import { basename, join, resolve, dirname } from 'node:path'
const projectRoot = resolve(process.cwd())
const projectMetadata = JSON.parse(readFileSync(join(projectRoot, 'package.json'), 'utf8'))
const outputDirectory = resolve(process.env.VISION_PACK_OUTPUT_DIR ?? 'resources/vision-pack')
const platform = process.env.VISION_PACK_PLATFORM ?? process.platform
const arch = process.env.VISION_PACK_ARCH ?? process.arch
const packageNames = ['@huggingface/transformers', '@lancedb/lancedb', 'apache-arrow']
const excludedPackages = new Set(['onnxruntime-web', '@types/node', '@types/command-line-args', '@types/command-line-usage'])

// 内容寻址 revision：对打包后的 node_modules 目录逐文件哈希（规范化、排序），
// 不含每次构建都会变的 package.json / vision-pack.json（app 版本号字段）。
// 同一平台不同 app 版本只要视觉依赖没变，revision 就相同 → R2 只存一份，跨版本共享。
async function computeRevision(nodeModulesDirectory) {
  const entries = []
  async function walk(directory, prefix) {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      const relative = `${prefix}${entry.name}`
      const entryPath = join(directory, entry.name)
      if (entry.isDirectory()) await walk(entryPath, `${relative}/`)
      else if (entry.isFile()) {
        const content = await readFile(entryPath)
        entries.push(`${relative}:${createHash('sha256').update(content).digest('hex')}:${content.length}`)
      }
    }
  }
  await walk(nodeModulesDirectory, '')
  entries.sort()
  const hash = createHash('sha256')
  for (const entry of entries) hash.update(entry)
  return hash.digest('hex').slice(0, 32)
}

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
  const onnxRoot = join(outputDirectory, 'node_modules', 'onnxruntime-node', 'bin')
  try {
    for (const napiDirectory of await readdir(onnxRoot, { withFileTypes: true })) {
      if (!napiDirectory.isDirectory() || !/^napi-/u.test(napiDirectory.name)) continue
      const napiRoot = join(onnxRoot, napiDirectory.name)
      for (const entry of await readdir(napiRoot)) {
        if (entry !== platform) await rm(join(napiRoot, entry), { recursive: true, force: true })
      }
      for (const entry of await readdir(join(napiRoot, platform))) {
        if (entry !== arch) await rm(join(napiRoot, platform, entry), { recursive: true, force: true })
      }
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
        const isCurrent = packageName.startsWith(`@img/sharp-${platform}-${arch}`)
          || packageName.startsWith(`@img/sharp-libvips-${platform}-${arch}`)
          || (platform === 'linux'
            ? packageName === `@lancedb/lancedb-linux-${arch}-gnu`
            : platform === 'win32'
              ? packageName === `@lancedb/lancedb-win32-${arch}-msvc`
              : packageName === `@lancedb/lancedb-${platform}-${arch}`)
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
    version: process.env.npm_package_version ?? projectMetadata.version,
    private: true,
    main: 'node_modules/@lancedb/lancedb/dist/index.js'
  }
  await writeFile(join(outputDirectory, 'package.json'), `${JSON.stringify(packageJson, null, 2)}\n`)
  const revision = await computeRevision(join(outputDirectory, 'node_modules'))
  const manifest = {
    id: 'aivplayer-vision-pack',
    version: packageJson.version,
    revision,
    platform,
    arch,
    entry: 'package.json',
    packages: packageNames
  }
  await writeFile(join(outputDirectory, 'vision-pack.json'), `${JSON.stringify(manifest, null, 2)}\n`)
  console.log(`Vision Pack prepared: ${outputDirectory} (revision ${revision})`)
}

await main()
