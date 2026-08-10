import { readFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const flatpakDirectory = join(root, 'flatpak')
const manifestPath = join(flatpakDirectory, 'cn.quniv.aivplayer.yml')
const desktopPath = join(flatpakDirectory, 'cn.quniv.aivplayer.desktop')
const metainfoPath = join(flatpakDirectory, 'cn.quniv.aivplayer.metainfo.xml')
const generatedSourcesPath = join(flatpakDirectory, 'generated-sources.json')
const lancedbCargoSourcesPath = join(flatpakDirectory, 'lancedb-cargo-sources.json')

const [packageText, manifest, desktop, metainfo, generatedSources, lancedbCargoSources] = await Promise.all([
  readFile(join(root, 'package.json'), 'utf8'),
  readFile(manifestPath, 'utf8'),
  readFile(desktopPath, 'utf8'),
  readFile(metainfoPath, 'utf8'),
  readFile(generatedSourcesPath, 'utf8').catch(() => ''),
  readFile(lancedbCargoSourcesPath, 'utf8').catch(() => '')
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
assertCondition(manifest.includes('org.freedesktop.Sdk.Extension.rust-stable'), '没有声明 Rust SDK extension')
assertCondition(manifest.includes('- generated-sources.json'), 'manifest 没有接入离线 npm 源清单')
assertCondition(manifest.includes('npm install --offline'), 'Flatpak 构建不能依赖联网 npm install')
assertCondition(manifest.includes('--publish never'), 'Flatpak 构建不能触发 electron-builder 发布')
assertCondition(manifest.includes('name: ffmpeg'), 'Flatpak 必须从固定源码构建 FFmpeg')
assertCondition(manifest.includes('https://ffmpeg.org/releases/ffmpeg-8.1.2.tar.xz'), 'FFmpeg 源码归档地址不正确')
assertCondition(manifest.includes('sha256: 464beb5e7bf0c311e68b45ae2f04e9cc2af88851abb4082231742a74d97b524c'), 'FFmpeg 源码归档必须固定 SHA-256')
assertCondition(manifest.includes('--disable-gpl --disable-nonfree'), 'Flatpak FFmpeg 必须关闭 GPL 与 nonfree 构建')
assertCondition(manifest.includes('--disable-autodetect'), 'Flatpak FFmpeg 不能隐式探测宿主依赖')
assertCondition(manifest.includes('make install'), 'Flatpak 没有安装 FFmpeg 运行时')
assertCondition(manifest.includes('name: libde265'), 'Flatpak 必须从固定源码构建 libde265')
assertCondition(manifest.includes('commit: 7ba65889d3d6d8a0d99b5360b028243ba843be3a'), 'libde265 必须固定 commit')
assertCondition(manifest.includes('name: libjpeg-turbo'), 'Flatpak 必须从固定源码构建 libjpeg-turbo')
assertCondition(manifest.includes('commit: 4e151a4ad91001b3aa8c2ece2205c15f487ce320'), 'libjpeg-turbo 必须固定 commit')
assertCondition(manifest.includes('name: x265'), 'Flatpak 必须从固定源码构建 x265')
assertCondition(manifest.includes('commit: 07295ba7ab551bb9c1580fdaee3200f1b45711b7'), 'x265 必须固定 commit')
assertCondition(manifest.includes('path: patches/x265-cmake-compat.patch'), 'x265 缺少 CMake 兼容 patch')
assertCondition(manifest.includes('name: libheif'), 'Flatpak 必须从固定源码构建 libheif')
assertCondition(manifest.includes('commit: 2c4bbb54c2738d4a5efbbe3e5fa1d5d76bb88eb0'), 'libheif 必须固定 commit')
assertCondition(manifest.includes('-DENABLE_PLUGIN_LOADING=OFF'), 'libheif 必须关闭运行时插件加载')
assertCondition(manifest.includes('-DWITH_X265=ON'), 'libheif 必须启用固定 x265 编码器')
assertCondition(manifest.includes('-DCMAKE_DISABLE_FIND_PACKAGE_TIFF=TRUE'), 'libheif 不能探测宿主 TIFF')
assertCondition(manifest.includes('-DCMAKE_DISABLE_FIND_PACKAGE_PNG=TRUE'), 'libheif 不能探测宿主 PNG')
assertCondition(manifest.includes('-DCMAKE_DISABLE_FIND_PACKAGE_WEBP=TRUE'), 'libheif 不能探测宿主 WebP')
assertCondition(manifest.includes('-DWITH_X264=OFF'), 'libheif 必须关闭 x264 后端')
assertCondition(manifest.includes('heif-convert'), 'Flatpak 必须提供 heif-convert 兼容入口')
assertCondition(manifest.includes('name: whisper-cpp'), 'Flatpak 必须从固定源码构建 whisper.cpp')
assertCondition(manifest.includes('https://github.com/ggml-org/whisper.cpp.git'), 'whisper.cpp 源码地址不正确')
assertCondition(manifest.includes('commit: f049fff95a089aa9969deb009cdd4892b3e74916'), 'whisper.cpp 必须固定 commit')
assertCondition(manifest.includes('export AIVPLAYER_WHISPER_CPP_BIN=/app/bin/whisper-cli'), 'Flatpak 没有指向 whisper-cli 运行时')
assertCondition(!manifest.includes('build/bin/whisper-cli'), 'Flatpak 不能复制不存在的 build/bin/whisper-cli')
assertCondition(manifest.includes('name: protobuf'), 'LanceDB 构建缺少 protobuf 源码模块')
assertCondition(manifest.includes('protobuf-30.2.tar.gz'), 'protobuf 源码版本必须固定')
assertCondition(manifest.includes('PROTOC: /app/bin/protoc'), 'LanceDB 必须显式使用 Flatpak 构建的 protoc')
assertCondition(manifest.includes('name: lancedb-native'), 'Flatpak 没有声明 LanceDB 源码构建模块')
assertCondition(manifest.includes('https://github.com/lancedb/lancedb.git'), 'LanceDB 源码地址不正确')
assertCondition(manifest.includes('commit: 3f8d76817e6020ea344fba8a66c5de9ad8c82234'), 'LanceDB 必须固定 v0.31.0 commit')
assertCondition(manifest.includes('cargo build --release --locked --offline -p lancedb-nodejs'), 'LanceDB 构建命令必须交给 Flatpak builder 执行')
assertCondition(manifest.includes('lancedb-cargo-sources.json'), 'LanceDB 缺少 Cargo 源码清单')
assertCondition(manifest.includes('desktopName = "cn.quniv.aivplayer.desktop"'), '没有修正 Electron desktop 文件名')
assertCondition(packageJson.scripts?.['flatpak:prepare-ci-manifest'], '缺少 Flatpak CI 本地源码 manifest 生成命令')
assertCondition(packageJson.scripts?.['flatpak:audit-native'], '缺少 Flatpak 原生 npm 依赖审计命令')
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
assertCondition(lancedbCargoSources.trim().length > 0, '缺少 lancedb-cargo-sources.json，请生成 Flathub 离线 Cargo 源清单')
let parsedSources
try {
  parsedSources = JSON.parse(generatedSources)
} catch (error) {
  throw new Error(`Flatpak 检查失败：generated-sources.json 不是合法 JSON：${error instanceof Error ? error.message : String(error)}`)
}
assertCondition(Array.isArray(parsedSources) && parsedSources.length > 0, 'generated-sources.json 没有有效 source')
let parsedLancedbCargoSources
try {
  parsedLancedbCargoSources = JSON.parse(lancedbCargoSources)
} catch (error) {
  throw new Error(`Flatpak 检查失败：lancedb-cargo-sources.json 不是合法 JSON：${error instanceof Error ? error.message : String(error)}`)
}
assertCondition(Array.isArray(parsedLancedbCargoSources) && parsedLancedbCargoSources.length > 0, 'lancedb-cargo-sources.json 没有有效 source')
const lancedbCargoConfig = parsedLancedbCargoSources.find((source) => (
  source?.type === 'inline' && source?.dest === '.cargo' && source?.['dest-filename'] === 'config'
))
assertCondition(lancedbCargoConfig, 'LanceDB Cargo 离线配置必须写入 .cargo/config')
assertCondition(
  typeof lancedbCargoConfig.contents === 'string' && lancedbCargoConfig.contents.includes('replace-with = "vendored-sources"'),
  'LanceDB Cargo 必须替换为 vendored source'
)

console.log(`Flatpak 静态检查通过：${id} v${version}，${parsedSources.length} 个 npm source，${parsedLancedbCargoSources.length} 个 Cargo source`)
