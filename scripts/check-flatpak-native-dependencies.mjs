import { readFile } from 'node:fs/promises'
import { join } from 'node:path'

const root = join(import.meta.dirname, '..')
const lockfilePath = join(root, 'package-lock.json')
const strict = process.argv.includes('--strict')

const lockfile = JSON.parse(await readFile(lockfilePath, 'utf8'))
const packages = lockfile.packages ?? {}

const families = [
  {
    id: 'lancedb',
    label: 'LanceDB Node binding',
    matches: (name) => name.startsWith('@lancedb/lancedb'),
    action: '用 LanceDB nodejs napi 源码构建，不能保留 npm 平台二进制包。',
  },
  {
    id: 'onnxruntime',
    label: 'ONNX Runtime Node binding',
    matches: (name) => name === 'onnxruntime-node',
    action: '从 ONNX Runtime 与 Node binding 源码构建，或在 Flatpak 版移除视觉依赖。',
  },
  {
    id: 'sharp',
    label: 'Sharp / libvips',
    matches: (name) => name === 'sharp' || name.startsWith('@img/sharp-'),
    action: '从 libvips 与 sharp 源码构建，不能把 @img/sharp-* 预编译包带入。',
  },
  {
    id: 'sherpa',
    label: 'sherpa-onnx Node binding',
    matches: (name) => name.startsWith('sherpa-onnx'),
    action: '从 sherpa-onnx Node binding 源码构建，或让 Flatpak 版明确关闭说话人 Provider。',
  },
]

function packageNameFromLockPath(lockPath) {
  const marker = 'node_modules/'
  const markerIndex = lockPath.lastIndexOf(marker)
  const packagePath = markerIndex >= 0 ? lockPath.slice(markerIndex + marker.length) : ''
  const segments = packagePath.split('/')
  if (segments[0]?.startsWith('@')) return segments.slice(0, 2).join('/')
  return segments[0] ?? ''
}

function familyFor(name) {
  return families.find((family) => family.matches(name))
}

const groups = new Map()
for (const [lockPath, metadata] of Object.entries(packages)) {
  const name = packageNameFromLockPath(lockPath)
  const family = familyFor(name)
  if (!family || !metadata?.version) continue

  const key = `${family.id}:${name}@${metadata.version}`
  const group = groups.get(key) ?? {
    family,
    name,
    version: String(metadata.version),
    entries: 0,
    locations: [],
    platforms: new Set(),
    optional: false,
    installScript: false,
    resolved: metadata.resolved ?? '',
  }

  group.entries += 1
  group.optional ||= metadata.optional === true
  group.installScript ||= metadata.hasInstallScript === true
  for (const platform of metadata.os ?? []) group.platforms.add(platform)
  for (const architecture of metadata.cpu ?? []) group.platforms.add(architecture)
  if (group.locations.length < 3) group.locations.push(lockPath)
  groups.set(key, group)
}

const rows = [...groups.values()].sort((left, right) => {
  const familyOrder = families.findIndex((family) => family.id === left.family.id) - families.findIndex((family) => family.id === right.family.id)
  return familyOrder || left.name.localeCompare(right.name) || left.version.localeCompare(right.version)
})

console.log('Flatpak 原生 npm 依赖审计')
console.log(`lockfile：${lockfilePath}`)
console.log(`发现：${rows.length} 个依赖版本，${rows.reduce((total, row) => total + row.entries, 0)} 个 lockfile 条目`)
console.log('')

for (const row of rows) {
  const platformText = [...row.platforms].sort().join(', ') || '通用包'
  const flags = [
    row.optional ? 'optional' : '',
    row.installScript ? 'install-script' : '',
  ].filter(Boolean).join(', ') || '普通包'
  console.log(`[阻塞] ${row.name}@${row.version}（${flags}；${platformText}；${row.entries} 个条目）`)
  console.log(`       处理：${row.family.action}`)
  console.log(`       来源：${row.resolved || 'lockfile 未记录 resolved'}`)
  for (const location of row.locations) console.log(`       位置：${location}`)
  if (row.entries > row.locations.length) console.log(`       位置：其余 ${row.entries - row.locations.length} 个重复/嵌套条目省略`)
  console.log('')
}

if (rows.length === 0) {
  console.log('未发现当前审计范围内的原生 npm 依赖。')
  process.exit(0)
}

console.log('结论：当前 lockfile 仍包含预编译平台包或会下载原生二进制的安装脚本，不能作为 Flathub 最终构建输入。')
console.log('默认模式只报告，便于本地排查；CI 或提交前可使用 --strict 将这些阻塞项变成失败。')
if (strict) process.exitCode = 1
