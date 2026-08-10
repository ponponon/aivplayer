# AIVPlayer Flatpak 适配说明

这里保存 AIVPlayer 的 Flatpak 适配文件，目标是让应用可以按 Flathub 的“从源代码构建、构建阶段离线”规则重建。

## 当前阶段

这是第一阶段的构建骨架，不代表已经可以直接提交 Flathub。当前已完成：

- 固定 Flatpak ID `cn.quniv.aivplayer`，与 Electron 的 `appId` 保持一致；
- Electron BaseApp、Node.js SDK extension、X11/PulseAudio/GPU 和用户目录权限的初始声明；
- whisper.cpp `v1.9.1` 已改为 Flatpak manifest 中的固定 Git commit 源码模块，安装到 `/app/bin/whisper-cli`，运行 wrapper 会显式指向该路径；
- protobuf `v30.2` 已加入固定 SHA-512 的源码模块，远程 builder 会生成 `/app/bin/protoc` 供 LanceDB 的 Rust build script 使用；
- Flatpak npm 构建已显式跳过 `onnxruntime-node` 的 CUDA 扩展下载，兼容新旧安装变量，使用 npm 包随附的 CPU 运行时，避免离线构建访问 NuGet；
- Electron `v43.2.0` Linux x64 / ARM64 发行包已按架构作为固定 SHA-256 的 Flatpak 源下载并解压到独立目录，electron-builder 通过 `electronDist` 使用本地目录，避免构建阶段访问 GitHub；
- FFmpeg `8.1.2` 已改为官方源码归档模块，固定 SHA-256，关闭 GPL/nonfree 和外部自动探测，静态安装 `/app/bin/ffmpeg` 与 `/app/bin/ffprobe`；
- libheif `v1.23.1` 已接入固定源码模块，依赖 libde265 `v1.0.16`、libjpeg-turbo `3.1.2` 和 x265 `3.4`，关闭插件加载、宿主可选后端探测并安装 `heif-enc`、`heif-convert`；x265 的 GPL-2.0 许可证边界需要随最终 Flathub 审核材料复核。x265 另带一个只修复 CMake 4 兼容性的最小 patch；
- LanceDB `v0.31.0` 已加入 Flathub manifest 的源码构建描述：固定 Git commit、Cargo.lock 最小修正和 Cargo 离线源码清单均作为 manifest 输入；本机不执行 Cargo 编译，实际 Linux x86_64 / arm64 编译由 Flathub builder 完成。
- Electron 启动 wrapper、desktop 文件、AppStream MetaInfo 和 Flatpak 专用 electron-builder 配置；
- 从 `package-lock.json` 生成离线 npm 源的入口；当前仓库中的 `generated-sources.json` 是用于第一阶段静态接线的 stub 清单，来源完整性沿用 lockfile，但没有包含 Electron BaseApp 缓存等特殊扩展。
- 新增 `npm run flatpak:audit-native` 原生 npm 依赖审计，当前会明确列出 LanceDB、ONNX Runtime、Sharp/libvips 和 sherpa-onnx 的 62 个 lockfile 条目；它们仍是阻塞项，不把“平台包是 optional”误判为“已经符合 Flathub”。

## 仍需完成的 Flathub 阻塞项

1. LanceDB 已写入 Flathub 源码构建模块；本地 CPU 版 `onnxruntime-node` 已通过跳过 CUDA 下载规避 NuGet 网络依赖，Electron 发行包也已固定为 manifest 源，但 Sharp 的 libvips 平台包和 sherpa-onnx 的平台包仍是原生依赖阻塞项。可用 `npm run flatpak:audit-native -- --strict` 作为依赖审计门禁。
2. 把当前只读、随包提供的 SigLIP2 视觉模型改成用户数据目录中的可审计下载 / 安装流程；Flathub manifest 不应携带这类大模型二进制。
3. 重新评估文件访问权限。当前实现支持用户选择任意媒体目录、递归扫描和导出，第一版使用 XDG 目录权限配合文件选择器；最终提交前需要在 Flatpak 沙箱中用真实文件选择、目录扫描和导出 Smoke 验证，并尽量收窄权限。
4. 在 Linux Flatpak 构建机上运行 `flatpak-builder`、`flatpak-builder-lint` 和真实启动 Smoke。macOS 开发机没有 Flatpak 工具，不能用本地 TypeScript 构建代替这一步。

`flatpak:generate-sources` 的正式结果必须在 Linux 构建环境重新生成并审查；本机代理下 Electron / esbuild 特殊源曾出现长时间不退出，因此不能把本机 stub 清单当成最终 Flathub 构建证据。

## 本地准备命令

在安装 `flatpak`、`flatpak-builder`、Flathub Freedesktop 25.08 runtime/SDK 和 `flatpak-node-generator` 后运行：

```sh
npm run flatpak:check
npm run flatpak:generate-sources
# 使用 flatpak-cargo-generator.py 根据 LanceDB Cargo.lock 生成 Cargo 源码清单
flatpak-builder build-dir flatpak/cn.quniv.aivplayer.yml \
  --install-deps-from=flathub --force-clean --user --install
flatpak run cn.quniv.aivplayer
```

GitHub Actions 的 `Flatpak build (x86_64)` 会在 Linux Runner 中安装 `org.flatpak.Builder`，生成当前 checkout 的本地源码 manifest，并执行实际构建、manifest lint、repo lint 和 bundle 生成；手动运行 workflow 时可勾选 ARM64 构建。这样 PR 不会误把固定的 `v0.5.0` release tag 当成待验证源码。

Flathub 的提交仓库要求 manifest、desktop、MetaInfo 和图标位于提交仓库边界内；最终 PR 需要由项目维护者人工创建和回复审核意见，本项目不会自动创建 Flathub PR。
