import { readFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const flatpakDirectory = join(root, 'flatpak')
const manifestPath = join(flatpakDirectory, 'cn.quniv.aivplayer.yml')
const desktopPath = join(flatpakDirectory, 'cn.quniv.aivplayer.desktop')
const metainfoPath = join(flatpakDirectory, 'cn.quniv.aivplayer.metainfo.xml')
const generatedSourcesPath = join(flatpakDirectory, 'generated-sources.json')

const [packageText, manifest, desktop, metainfo, generatedSources] = await Promise.all([
  readFile(join(root, 'package.json'), 'utf8'),
  readFile(manifestPath, 'utf8'),
  readFile(desktopPath, 'utf8'),
  readFile(metainfoPath, 'utf8'),
  readFile(generatedSourcesPath, 'utf8').catch(() => '')
])

const packageJson = JSON.parse(packageText)
const id = 'cn.quniv.aivplayer'
const version = String(packageJson.version)

function assertCondition(condition, message) {
  if (!condition) throw new Error(`Flatpak 检查失败：${message}`)
}

assertCondition(manifest.includes(`id: ${id}`), 'manifest 的应用 ID 不正确')
assertCondition(manifest.includes("runtime: org.freedesktop.Platform"), '没有声明 Freedesktop runtime')
assertCondition(manifest.includes("runtime-version: '25.08'"), 'runtime 不是当前固定的 25.08')
assertCondition(manifest.includes(`base: org.electronjs.Electron2.BaseApp`), '没有声明 Electron BaseApp')
assertCondition(manifest.includes(`base-version: '25.08'`), 'Electron BaseApp 版本与 runtime 不一致')
assertCondition(manifest.includes('org.freedesktop.Sdk.Extension.node22'), '没有声明 Node.js SDK extension')
assertCondition(manifest.includes('- generated-sources.json'), 'manifest 没有接入离线 npm 源清单')
assertCondition(manifest.includes('npm install --offline'), 'Flatpak 构建不能依赖联网 npm install')
assertCondition(manifest.includes('--publish never'), 'Flatpak 构建不能触发 electron-builder 发布')
assertCondition(manifest.includes('desktopName = "cn.quniv.aivplayer.desktop"'), '没有修正 Electron desktop 文件名')
assertCondition(!manifest.includes('--filesystem=host'), '禁止使用 host 文件系统权限')
assertCondition(!manifest.includes('resources/ffmpeg') && !manifest.includes('resources/whisper.cpp'), '不能把桌面端预编译运行时直接带进 Flatpak')
assertCondition(manifest.includes(`tag: v${version}`), `manifest 源码 tag 必须与 package.json ${version} 一致`)

assertCondition(desktop.includes(`Exec=${id} %U`), 'desktop 文件 Exec 必须指向 Flatpak command')
assertCondition(desktop.includes(`Icon=${id}`), 'desktop 文件 Icon 必须使用 Flatpak ID')
assertCondition(desktop.includes('Type=Application'), 'desktop 文件缺少 Application 类型')
assertCondition(metainfo.includes(`<id>${id}</id>`), 'MetaInfo ID 不正确')
assertCondition(metainfo.includes(`<launchable type="desktop-id">${id}.desktop</launchable>`), 'MetaInfo launchable 不正确')
assertCondition(metainfo.includes('<project_license>MIT</project_license>'), 'MetaInfo 缺少项目许可证')
assertCondition(metainfo.includes(`<release version="${version}"`), 'MetaInfo release 版本与 package.json 不一致')

assertCondition(generatedSources.trim().length > 0, '缺少 generated-sources.json，请先运行 flatpak:generate-sources')
let parsedSources
try {
  parsedSources = JSON.parse(generatedSources)
} catch (error) {
  throw new Error(`Flatpak 检查失败：generated-sources.json 不是合法 JSON：${error instanceof Error ? error.message : String(error)}`)
}
assertCondition(Array.isArray(parsedSources) && parsedSources.length > 0, 'generated-sources.json 没有有效 source')

console.log(`Flatpak 静态检查通过：${id} v${version}，${parsedSources.length} 个离线 source`)
