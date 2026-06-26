# AIVPlayer Electron VLC-Class Player Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 从零实现一个 Electron 桌面视频播放器，优先保证高清视频播放稳定、UI 现代化，并逐步补齐 VLC 常用能力。

**Architecture:** Electron 负责桌面壳、菜单、文件系统、系统集成和窗口生命周期；React + Vite + TypeScript 负责播放器界面；播放器核心抽象为 `MediaEngine`，第一阶段用 HTML5 video 快速做可用 MVP，第二阶段做原生播放内核验证，在 `mpv` 进程 IPC、`libVLC` 嵌入、`libmpv` native addon 三条路线中选择长期主线。`ffmpeg.wasm` 只用于轻量探测、截图/转码辅助，不作为 4K/8K 实时播放主路径。

**Tech Stack:** Electron, React, Vite, TypeScript, CSS Modules or plain CSS tokens, lucide-react, mpv JSON IPC, optional libVLC/libmpv native backend, electron-builder, Vitest, Playwright.

---

## Product Target

AIVPlayer 的目标不是网页 `<video>` demo，而是一个本地桌面媒体工具：

- 本地文件打开、拖拽、播放列表、最近播放、断点续播。
- 4K/8K、HEVC、MKV、MOV、TS 等文件尽量走硬件解码。
- 字幕支持 SRT/ASS/SSA，字幕延迟、样式、加载外部字幕。
- 音轨/字幕轨切换，倍速、循环、AB repeat、截图、画面比例、旋转、基础滤镜。
- 现代深色影院 UI：画面优先，控制栏自动隐藏，侧边播放列表，媒体信息面板，快捷键体系。
- 打包为 macOS/Windows/Linux 桌面应用。

## Important Technical Decision

不要把 `ffmpeg.wasm` 当作 VLC 级播放内核。它适合转码、探测、截图等离线任务，但实时播放 4K/8K、高码率 HEVC、复杂 ASS 字幕会明显吃 CPU 和内存，也拿不到成熟硬件解码链路。

正经播放器路线应当是：

- `HTML5VideoEngine`: 先覆盖 MP4/WebM/MOV 等 Chromium 原生支持格式，快速形成可用产品。
- `MpvIpcEngine`: 作为第一条原生内核验证路线，使用 `mpv --input-ipc-server` 进行控制，启用 `--hwdec=auto-safe`、`--vo=gpu-next` 等硬件/GPU 路径；优点是实现快、能力强，风险是跨平台嵌入窗口不完全一致。
- `LibVlcEngine`: 作为跨平台嵌入验证路线，使用 libVLC 的 `NSView`、`X Window`、`HWND` 渲染接口；优点是官方嵌入 API 覆盖三大桌面平台，风险是包体、插件分发和 Electron native binding 成本。
- `LibMpvEngine`: 作为长期高质量路线，使用 libmpv C API/native addon；优点是播放器能力和渲染质量更贴近 mpv，风险是 Electron ABI、三平台构建和签名打包复杂。
- `MediaEngine` 抽象统一 UI 调用，不让 UI 直接知道底层是 HTML5 还是 mpv。

---

## File Structure

```text
aivplayer/
├── docs/
│   └── superpowers/
│       └── plans/
│           └── 2026-06-24-aivplayer-electron-vlc-player.md
├── electron-builder.yml
├── package.json
├── tsconfig.json
├── vite.config.ts
├── src/
│   ├── main/
│   │   ├── index.ts
│   │   ├── window.ts
│   │   ├── menu.ts
│   │   ├── ipc/
│   │   │   ├── index.ts
│   │   │   ├── file-dialog.ts
│   │   │   ├── media-ipc.ts
│   │   │   └── settings-ipc.ts
│   │   ├── media/
│   │   │   ├── media-engine.ts
│   │   │   ├── mpv-engine.ts
│   │   │   ├── mpv-process.ts
│   │   │   ├── mpv-path.ts
│   │   │   └── media-metadata.ts
│   │   ├── ai/
│   │   │   ├── asr-job-queue.ts
│   │   │   ├── asr-runtime.ts
│   │   │   ├── whisper-cpp-runtime.ts
│   │   │   ├── audio-extractor.ts
│   │   │   ├── subtitle-transcriber.ts
│   │   │   ├── subtitle-writer.ts
│   │   │   └── model-manager.ts
│   │   └── storage/
│   │       ├── app-store.ts
│   │       ├── recent-files.ts
│   │       └── playback-position.ts
│   ├── preload/
│   │   └── index.ts
│   ├── renderer/
│   │   ├── index.html
│   │   ├── main.tsx
│   │   ├── app/
│   │   │   ├── App.tsx
│   │   │   ├── AppShell.tsx
│   │   │   └── player-state.ts
│   │   ├── player/
│   │   │   ├── PlayerStage.tsx
│   │   │   ├── Html5VideoSurface.tsx
│   │   │   ├── ControlBar.tsx
│   │   │   ├── Timeline.tsx
│   │   │   ├── VolumeControl.tsx
│   │   │   ├── TrackMenus.tsx
│   │   │   ├── SubtitleOverlay.tsx
│   │   │   └── useKeyboardShortcuts.ts
│   │   ├── library/
│   │   │   ├── PlaylistPanel.tsx
│   │   │   ├── RecentFilesPanel.tsx
│   │   │   └── MediaInfoPanel.tsx
│   │   ├── settings/
│   │   │   ├── SettingsDialog.tsx
│   │   │   └── shortcuts.ts
│   │   └── styles/
│   │       ├── tokens.css
│   │       ├── base.css
│   │       ├── layout.css
│   │       └── player.css
│   └── shared/
│       ├── ipc-channels.ts
│       ├── media-types.ts
│       ├── settings-types.ts
│       └── file-types.ts
├── tests/
│   ├── unit/
│   │   ├── media-engine.test.ts
│   │   ├── playback-position.test.ts
│   │   └── shortcuts.test.ts
│   └── e2e/
│       ├── launch.spec.ts
│       ├── open-file.spec.ts
│       └── player-ui.spec.ts
└── scripts/
    ├── doctor-mpv.ts
    ├── doctor-asr-runtime.ts
    ├── collect-media-fixtures.ts
    └── smoke-playback.ts
```

---

## Milestone 0: Repo Bootstrap

**Outcome:** 一个可运行、可测试、可打包的 Electron + React + TypeScript 空项目。

- [ ] 初始化 npm 项目和 Git：`git init && npm init -y`。
- [ ] 如果需要联网安装依赖，先运行 `~/.agents/instructions/script/test-proxy.sh`，优先走 `127.0.0.1:10022`。
- [ ] 安装基础依赖：`electron`, `vite`, `typescript`, `react`, `react-dom`, `lucide-react`, `vitest`, `playwright`, `electron-builder`。
- [ ] 创建 `src/main/index.ts`、`src/preload/index.ts`、`src/renderer/main.tsx`，确认 `npm run dev` 能打开桌面窗口。
- [ ] 设置 `contextIsolation: true`、`nodeIntegration: false`，所有系统能力只通过 preload 暴露。
- [ ] 提交点：`feat: bootstrap electron react player shell`。

## Milestone 1: App Shell And UI Design System

**Outcome:** 先把播放器“长得像产品”，不是浏览器页面。

- [ ] 建立 UI 方向：深色影院工作台，视频区域全屏优先，底部控制栏半透明，左右侧栏可收起。
- [ ] 创建 `tokens.css`：背景、面板、边框、文字、强调色、危险色、焦点环、阴影、圆角、控制栏尺寸。
- [ ] 创建 `AppShell.tsx`：自定义标题栏、视频舞台、底部控制栏、右侧媒体信息/播放列表抽屉。
- [ ] 图标统一使用 `lucide-react`；编码前在 `node_modules/lucide-react/dist` 或类型定义里确认图标名存在。
- [ ] 做两个状态：空状态和已加载视频状态，避免打开应用时像半成品。
- [ ] Playwright 截图检查：1280x800、1920x1080、390x844，确保控制栏、侧栏、文字不重叠。
- [ ] 提交点：`feat: build modern player shell`。

## Milestone 2: HTML5 Playback MVP

**Outcome:** 常见格式可以真正播放，用户可以日常打开 MP4/WebM/MOV。

- [ ] 实现 `Html5VideoSurface.tsx`，负责 `<video>` 元素、播放、暂停、seek、音量、倍速、全屏、画中画。
- [ ] 实现 `player-state.ts`，记录当前文件、播放状态、时间、音量、倍速、循环、错误信息。
- [ ] 实现主进程文件对话框 IPC：打开单文件、打开多个文件、打开文件夹。
- [ ] 实现拖拽打开：拖入文件追加到 playlist，拖入文件夹扫描视频文件。
- [ ] 实现 `ControlBar.tsx`、`Timeline.tsx`、`VolumeControl.tsx`，支持鼠标拖动、键盘控制、自动隐藏。
- [ ] 实现快捷键：Space、Left/Right、Up/Down、F、M、O、S、L、J/K/L。
- [ ] 写单测覆盖时间格式化、seek 边界、快捷键映射。
- [ ] 提交点：`feat: add html5 playback mvp`。

## Milestone 3: Native Playback Backend Spike

**Outcome:** 用最小成本验证跨平台原生播放内核，决定长期主线，而不是一上来把项目绑死在单一方案上。

- [ ] 创建 `MediaEngine` 接口：`load`, `play`, `pause`, `stop`, `seek`, `setVolume`, `setSpeed`, `setTrack`, `setSubtitle`, `snapshot`, `destroy`。
- [ ] 创建 `MpvIpcEngine` spike：启动 mpv、创建 IPC socket/pipe、发送 JSON command、订阅 property change。
- [ ] 创建 `mpv-path.ts`：先检测 bundled mpv，再检测系统 `mpv`，缺失时弹出修复指引。
- [ ] mpv 默认参数：`--idle=yes`, `--keep-open=yes`, `--input-terminal=no`, `--osc=no`, `--terminal=no`, `--hwdec=auto-safe`, `--vo=gpu-next`。
- [ ] 先验证“受控播放”版本：Electron UI 控制 mpv 播放、暂停、seek、音量、倍速、字幕、音轨，视频渲染由 mpv 自己负责。
- [ ] 验证 mpv 嵌入：Windows 用 `HWND`，Linux/X11 用 `Window`；macOS 不承诺 `--wid`，单独记录结果。
- [ ] 创建 `LibVlcEngine` spike：验证 libVLC 在 macOS `NSView`、Linux `X Window`、Windows `HWND` 三端嵌入视频输出的可行性。
- [ ] 创建 `LibMpvEngine` 评估文档：列出 native addon、Electron ABI、三平台 CI、签名/公证、动态库分发成本，不在第一轮强行实现。
- [ ] 通过 `scripts/doctor-backend.ts` 输出 mpv/libVLC 路径、版本、硬件解码能力、视频输出后端。
- [ ] 决策门：如果“单窗口嵌入跨平台”优先级最高，优先 libVLC；如果“字幕/画质/高级播放控制”优先级最高，优先 mpv；如果后续要极致集成，再升级 libmpv native addon。
- [ ] 提交点：`feat: validate native playback backend`。

## Milestone 4: VLC-Like Core Features

**Outcome:** 补齐用户最常用的 VLC/PotPlayer 功能，不追求一次性塞满所有高级项。

- [ ] 播放列表：追加、删除、排序、上一集/下一集、自动播放同文件夹下一集。
- [ ] 最近播放：记录文件路径、时长、上次位置、最后打开时间、封面缩略图。
- [ ] 断点续播：超过 60 秒的视频记录播放位置，下次打开提示恢复。
- [ ] 字幕：加载外部 SRT/ASS/SSA，字幕轨选择，字幕延迟 `-5s` 到 `+5s`，字幕字号/位置设置。
- [ ] 音频：音轨切换，音量放大到 200%，声道模式后置规划。
- [ ] 视频：画面比例、适应窗口、原始尺寸、旋转 90 度、基础亮度/对比度/饱和度。
- [ ] 播放：倍速 `0.25x` 到 `4x`，单文件循环、列表循环、随机播放、AB repeat。
- [ ] 截图：保存当前帧到用户图片目录，文件名带视频名和时间戳。
- [ ] 提交点：`feat: add vlc-like playback controls`。

## Milestone 5: Settings And Persistence

**Outcome:** 用户设置可持久化，播放器越用越顺手。

- [ ] `app-store.ts` 使用 JSON 文件保存配置，路径放在 Electron `app.getPath('userData')`。
- [ ] 设置项：默认音量、默认倍速、主题、硬件解码开关、打开时自动播放、记住位置、截图目录、快捷键。
- [ ] 快捷键编辑：冲突检测、恢复默认、导入/导出 JSON。
- [ ] 隐私选项：清空最近播放、清空播放位置、禁用历史记录。
- [ ] 提交点：`feat: add settings persistence`。

## Milestone 6: Performance And Reliability QA

**Outcome:** 明确知道播放器在什么视频上稳，什么视频上会降级或提示。

- [ ] 准备本地测试素材目录，不把大视频提交进仓库。
- [ ] `scripts/collect-media-fixtures.ts` 只记录 fixture manifest：格式、编码、分辨率、码率、字幕、音轨数量。
- [ ] `scripts/smoke-playback.ts` 自动打开样本，检查能否加载、是否有 duration、播放 10 秒是否有进度。
- [ ] 测试矩阵：1080p H.264 MP4、4K H.265 MKV、4K VP9 WebM、ASS 字幕 MKV、多音轨 MKV、TS 流文件。
- [ ] 记录性能指标：启动耗时、打开文件耗时、CPU、内存、是否启用硬件解码。
- [ ] 提交点：`test: add playback smoke checks`。

## Milestone 7: Packaging And Distribution

**Outcome:** 能打包给真实用户安装，而不是只能开发环境运行。

- [ ] 配置 `electron-builder.yml`：macOS dmg/zip、Windows nsis、Linux AppImage。
- [ ] 规划 mpv 分发策略：第一版检测系统 mpv；第二版按平台 bundle mpv binary。
- [ ] 应用图标、文件关联、协议处理、最近文件菜单。
- [ ] macOS 签名/公证作为后续任务，不阻塞本地可用包。
- [ ] 提交点：`build: package desktop player`。

## Milestone 8: Local ASR Subtitle Generation

**Outcome:** 在不破坏播放器流畅度的前提下，为无字幕视频生成本地字幕，并支持导出/加载到播放器。

- [ ] 创建 `AsrRuntime` 抽象：`healthCheck`, `listModels`, `loadModel`, `transcribeAudio`, `cancelJob`, `getProgress`。
- [ ] 创建 `AsrJobQueue`：ASR 必须在独立 worker/sidecar 进程中运行，不能阻塞 Electron renderer 或播放内核。
- [ ] 默认 ASR 后端使用 `whisper.cpp`：优先调用 bundled `whisper-cli`，后续可升级为 C API/native addon。
- [ ] 模型默认策略：首次引导下载 `small` 或 `large-v3-turbo`；低配机器允许选择 `base`；模型文件放到 Electron `userData/models/whisper`。
- [ ] 音频提取：从视频抽取 16kHz mono PCM WAV，长视频按时间窗口切分，避免一次性占用过多磁盘和内存。
- [ ] 字幕生成：调用 whisper.cpp 输出 segment timestamps，写入 SRT/VTT；保留原始 JSON 结果用于后续修正。
- [ ] 字幕加载：生成完成后自动作为外部字幕轨加载到当前视频，并允许用户开关显示。
- [ ] UI：ASR 面板显示模型、语言、进度、预计剩余时间、取消、重新生成、导出 SRT/VTT。
- [ ] 缓存策略：以 `video hash + audio stream metadata + model id + language + vad setting` 作为缓存 key，避免同一视频反复转写。
- [ ] 质量策略：支持手动指定语言；默认使用 VAD 跳过静音；长片分段后做时间戳回填，避免字幕整体偏移。
- [ ] 后续预留：翻译不是当前范围，但生成出的 SRT/VTT 可以作为未来翻译管线输入。
- [ ] 提交点：`feat: add local asr subtitle generation pipeline`。

---

## Execution Order

1. 先做 Milestone 0-2，拿到“能打开、能播放、UI 像样”的版本。
2. 再做 Milestone 3，验证 mpv/libVLC/libmpv 路线，把高码率和复杂格式交给最合适的原生内核，这一步决定播放器上限。
3. 然后做 Milestone 4-5，补齐 VLC 日常功能和持久化。
4. 接着做 Milestone 6-7，用测试素材和打包流程把它变成可长期维护的软件。
5. 最后做 Milestone 8，把本地 ASR 自动字幕作为独立作业管线接入，不影响播放器主链路。

## First Sprint Definition Of Done

第一轮不追求完整 VLC，但必须做到：

- `npm run dev` 启动 Electron 应用。
- 能打开本地 MP4/WebM/MOV 并播放。
- 支持播放/暂停、seek、音量、倍速、全屏、拖拽打开、播放列表基础追加。
- UI 在 1280x800 和 1920x1080 下不重叠、不像 demo。
- 有 `MediaEngine` 抽象，为 mpv/libVLC/libmpv 任一后端接入留好接口。
- 有至少 3 个单测和 1 个 Playwright 启动检查。

## Risk Register

- `mpv --wid` 官方覆盖 Windows/X11/Android 语义更明确，macOS 嵌入 Electron 不能提前承诺，需要 spike 验证。
- libVLC 的跨平台嵌入 API 更明确，但包体、插件分发、Node native binding 和许可证合规要提前评估。
- Bundle mpv 或 VLC runtime 都会增加安装包体积，但这是换取格式兼容和硬件解码的合理成本。
- Electron Chromium 原生播放的 codec 范围有限，不能作为 VLC 对标的唯一内核。
- ASS 字幕复杂排版应优先交给 mpv，自己在 DOM 里重绘只适合 SRT 这类简单字幕。
- 4K/8K 验证必须用真实素材，不能只靠单元测试。
- whisper.cpp 的 `whisper-cli` 输入通常需要 16-bit WAV，必须通过 ffmpeg 或播放内核能力先做音频抽取和格式转换。
- ASR 模型下载体积、推理速度、显存/内存占用差异很大，必须用模型管理和任务队列隔离，不要把模型直接嵌进播放器 UI 线程。

## Recommended Next Command

```bash
git init
~/.agents/instructions/script/test-proxy.sh
npm init -y
```

如果代理检测失败，先停下来让用户检查 QuickQ 或 Clash Verge；不要硬装依赖。
