<p align="center">
  <img src="brand/icon.png" width="120" alt="AIVPlayer Logo">
</p>

<h1 align="center">AIVPlayer</h1>

<p align="center">
  <strong>本地优先的 AI 视频工作台：播放、字幕、视觉影视库与短剧创作</strong>
</p>

<p align="center">
  <a href="https://aivplayer.pages.dev/">产品主页</a> ·
  <a href="https://github.com/ponponon/aivplayer/releases">GitHub 下载</a>
</p>

<p align="center">
  <a href="https://github.com/ponponon/aivplayer/releases">
    <img src="https://img.shields.io/github/v/release/ponponon/aivplayer" alt="Release">
  </a>
  <a href="https://github.com/ponponon/aivplayer/blob/main/LICENSE">
    <img src="https://img.shields.io/github/license/ponponon/aivplayer" alt="License">
  </a>
  <img src="https://img.shields.io/badge/platform-macOS%20%7C%20Windows%20%7C%20Linux-blue" alt="Platform">
</p>

<p align="center">
  <a href="#快速开始">快速开始</a> ·
  <a href="#功能概览">功能概览</a> ·
  <a href="#命令行工具">命令行工具</a> ·
  <a href="#从源码开发">从源码开发</a> ·
  <a href="#问题排查">问题排查</a> ·
  <a href="#参与贡献">参与贡献</a>
</p>

<p align="center">
  <a href="README.md">English</a> ·
  <a href="README.zh-CN.md">简体中文</a> ·
  <a href="README.ja-JP.md">日本語</a> ·
  <a href="README.ko-KR.md">한국어</a>
</p>

---

## 关于

AIVPlayer 是一款基于 Electron 的跨平台桌面视频工作台。它把本地视频播放、离线 ASR 字幕、字幕翻译、AI 内容总结、视觉影视库、图片处理和 AI 短剧文本创作放在同一个应用里。

AIVPlayer 的产品介绍、功能演示和下载入口位于 **[aivplayer.pages.dev](https://aivplayer.pages.dev/)**。需要下载桌面安装包时，可以直接访问 [GitHub Releases](https://github.com/ponponon/aivplayer/releases)。

### 本地优先与 AI 请求边界

- 播放、媒体解析、字幕缓存、视觉影视库索引和大部分处理流程在本机完成。
- ASR 使用本地 [whisper.cpp](https://github.com/ggerganov/whisper.cpp) 引擎，不需要把视频上传到在线转写服务。
- 字幕翻译、内容总结和 AI 短剧文本生成需要配置 OpenAI-compatible 服务；启用这些功能时，应用会把相应的文本内容发送给你配置的服务商。
- 视觉影视库使用本地 SigLIP2 模型和 LanceDB 保存索引，不上传原始视频或图片。

### 代码签名政策

发布签名流程见 [Code signing policy](CODE_SIGNING_POLICY.md)。

> Free code signing provided by [SignPath.io](https://signpath.io/), certificate by [SignPath Foundation](https://signpath.org/)

## 快速开始

### 1. 下载并安装

从 [产品主页](https://aivplayer.pages.dev/) 了解功能，或从下面的发布页下载对应平台的安装包：

- [GitHub Releases](https://github.com/ponponon/aivplayer/releases)

支持 macOS、Windows 和 Linux。安装包格式与 `aivcli` 命令的安装方式见[安装](#安装)章节。

### 2. 打开视频

安装后可以直接把视频拖进窗口，也可以使用文件选择器打开。播放器支持播放列表、播放历史、断点续播、字幕轨道、片段导出、截图和录屏。

### 3. 首次生成本地字幕

打开字幕面板后，按向导准备 whisper.cpp 运行时和 ASR 模型。模型可以从 ModelScope（国内源）或 Hugging Face 下载。准备完成后选择语言并生成字幕，结果会缓存到本机，之后再次打开同一个视频可以直接复用。

### 4. 按需配置云端 AI

如果需要字幕翻译、内容总结或 AI 短剧工作室，在设置或对应面板中配置 OpenAI-compatible API。API Key 由应用本地安全存储，CLI 的 `provider show/test` 只显示脱敏状态，不支持把 Key 直接写在命令行参数里。

## 功能概览

### 播放与媒体处理

- 支持 MP4、WebM、MOV、MKV、AVI、FLV、WMV、MPEG-TS、3GP、VOB、MXF、RMVB，以及 MPEG elementary stream、F4V、OGM、NUT、DV、GXF、CAVS、Dirac、R3D、WTV、FLI/FLC、RoQ、Smacker、Motion JPEG、Bink、Y4M、H.264/H.265 raw stream 等常见及专业视频格式；浏览器不兼容时可自动转码，支持拖拽打开和播放列表。
- 支持启动仅限局域网的 Web 播放：用 Chrome、Firefox、Safari 或手机浏览器访问桌面端共享的播放列表和选定目录；媒体通过 HTTP Range 流式读取，网页端可刷新目录发现新增文件；多网卡设备会展示所有可用访问地址并提供本地二维码，手机/平板还可以将页面添加到主屏幕。
- LAN Web 媒体库支持目录树、搜索、排序、收藏和多选操作；可批量下载选中文件，或直接把当前目录打包下载，目录层级会保留在 ZIP 中。
- LAN Web 目录扫描同时支持常见图片格式；图片可在列表 / 网格媒体库中预览、收藏、复制链接或下载，并与视频共用目录浏览和批量操作。
- LAN Web 提供当前会话任务中心，集中显示视频转码的排队、进行中、完成和失败状态；失败任务可直接重试，点击任务可回到对应媒体。
- 浏览器不兼容的媒体可按需在本机转为 H.264 + AAC MP4，原文件不改写，转码结果按源文件指纹缓存。
- 多台局域网设备同时请求转码时，任务会按本机并发上限排队，避免多部大视频并行转码耗尽资源。
- 转码前会检查缓存磁盘空间，过期结果和异常退出留下的临时文件会自动清理；源文件被替换后不会误用旧的兼容版本。
- 播放历史保存在本机，支持断点续播、未看完筛选、失效文件清理和右键操作；播放状态会按媒体指纹独立保存，文件被替换后不会误用旧进度。
- 支持字幕轨道、音量、倍速、全屏、键盘快捷键和控制栏自动隐藏；播放结束策略支持停止、自动下一条、循环当前、循环列表和随机播放，容器章节与用户时间书签可直接从时间轴定位。
- 支持按 15 秒、30 秒、60 秒导出片段，可选择纯视频、外挂字幕或字幕烧录。
- 支持当前画面截图、定时录屏和 GIF 导出，并可配置保存目录、格式和命名规则。
- 支持媒体信息查看，包括时长、分辨率、编码、帧率、码率、音频轨道和字幕轨道等。

### 本地 AI 字幕与内容理解

- 基于 whisper.cpp 的本地 ASR，支持中文、英文、日语、韩语等多语言识别。
- 同时生成 VTT 和 SRT，支持字幕缓存、默认语言、时间轴调整和生成状态查看。
- 支持通过 OpenAI-compatible 服务翻译字幕，包含缓存、重试、取消、术语表和目标语言切换。
- 支持 AI 内容总结，可生成无剧透摘要、详细摘要、章节和时间轴跳转，并导出 Markdown、TXT 或 JSON。
- AI 工作流支持引导处理或一次性处理，并提供缓存、取消、重试和断点续跑。

### 视觉影视库

- 使用本地 SigLIP2 模型对视频按时间间隔抽帧，并将向量保存到本机 LanceDB。
- 支持文字描述搜索、以图搜图和文字 / 视觉 / 文件名混合检索。
- 搜索结果可显示命中的字幕片段，并直接跳转到视频对应时间点。
- 可选分析 FFmpeg 场景切换并写入可搜索的场景片段证据；默认关闭，不会让普通索引和本地导入额外解码整部视频。
- 可选使用本地 SigLIP2 生成固定词表的零样本实体标签（人物、车辆、动物、背包、相机、电脑、手机、室内 / 室外等）并参与搜索；不联网、不做人物身份识别或框级物体检测，默认关闭。
- 可在本地实体标签目录中创建自定义查询标签、改名、添加别名、隐藏或合并标签；目录只保存在用户数据目录，下一次实体索引和搜索结果会应用这些维护规则。
- 支持目录递归扫描、增量索引、后台索引队列和索引进度 / 阶段耗时展示。只有用户明确提交手动索引任务后才会建立视觉索引，打开视频不会消耗索引算力。
- 全库视觉搜索结果支持后台导出 JSON / CSV；任务中心展示查询与写入进度并支持取消，文件会先分块写入临时文件，成功后原子替换，失败或取消不会留下半成品，仍限制为最多 100 万条已索引结果。
- CLI 也可以执行扫描、索引、状态查看和搜索，适合批量维护个人视频库。

### AI 短剧文本工作室

- 创建短剧项目，从 TXT / Markdown 小说识别章节并重复导入。
- 生成故事事件、故事骨架、改编策略和分集剧本，阶段结果保存到本机 SQLite。
- 根据剧本抽取角色、场景和道具资产，并生成结构化分镜大纲。
- 支持 OpenAI-compatible Provider、本地 Mock、连接测试、任务状态、缓存和断点续跑。
- 新增独立的图像 / 视频 / 音频生成任务队列，支持排队、运行中、进度、完成、失败和取消状态；应用重启后，中断的运行中任务会恢复为排队状态。
- 带有本地结果路径的已完成任务，在当前已打开剪辑工程时可以回流到现有剪辑时间线，复用素材源、主轨追加、撤销 / 重做和工程保存链路；未打开剪辑工程时不会修改时间线。
- 当前聚焦文本策划和分镜大纲，尚未绑定具体图片或视频生成厂商。

### 图片工作区

- 支持多图片导入、裁剪、旋转、翻转和批量处理。
- 支持格式、质量、目标体积压缩、批量导出和覆盖策略配置。

### 多语言与界面

- 支持简体中文、English、日本語和한국어。
- 深色影院风格，控制栏自动隐藏，适配不同窗口尺寸。
- macOS 使用原生窗口控件，Windows / Linux 使用与应用主题一致的自绘窗口控件。

## 命令行工具

安装器提供 `aivcli` 命令；CLI 与桌面端共用 ASR、字幕缓存、视觉影视库和 AI 短剧数据。先用下面的命令检查本机运行环境：

```bash
aivcli doctor
aivcli doctor --json
```

### 媒体与字幕

```bash
aivcli media info ./movie.mp4
aivcli asr ./movie.mp4 --format both --output-dir ./subtitles
aivcli subtitle convert ./movie.vtt
aivcli subtitle translate ./movie.vtt --to zh --output-dir ./subtitles
```

### 剪辑工程只读查询

`aivcli edit` 当前不会修改工程、媒体或字幕文件。`inspect` 输出可复核的时间线和字幕统计，`captions` 可按原文或译文检索脚本行，并保留已经标记删除的行；`propose` 只生成带工程 revision 的结构化方案，方便人工审阅后再接入确认应用：

```bash
aivcli edit inspect ./project.aivproj --json
aivcli edit captions ./project.aivproj --query "删除停顿" --limit 20 --json
aivcli edit propose delete-script ./project.aivproj segment-1 segment-2 --json
```

`edit propose delete-script` 会输出删除源时间区间、保留区间、受影响脚本行、字幕变化和预计时长。Proposal 使用工程快照指纹做 stale 检查；当前 CLI 只生成 JSON，不会写回 `.aivproj`。

桌面剪辑器删除脚本行时会先打开同一套 Proposal 预览，确认后才写入编辑历史和本地工程缓存；按住 Shift 可以多选脚本行并生成一次批量 Proposal。如果确认前工程已经变化，应用会被拒绝并要求重新生成方案。

### 本机剪辑 MCP

可以把固定工程以本机 stdio MCP 方式提供给 Agent；默认服务只暴露 `inspect`、`captions` 和 `propose delete-script` 三个只读工具，不监听网络端口，也不能应用 Proposal、写文件、删除媒体或执行 shell：

```bash
aivcli mcp serve ./project.aivproj
```

MCP 客户端配置示例：

```json
{
  "mcpServers": {
    "aivplayer-editing": {
      "command": "aivcli",
      "args": ["mcp", "serve", "/absolute/path/project.aivproj"]
    }
  }
}
```

工程路径在服务启动时固定，Agent 不能通过工具参数切换到其他文件；真正应用仍必须回到桌面确认 Dialog，并经过工程 revision 校验。

如果要让可信的本机 Agent 把 Proposal 交给当前打开的桌面编辑器确认，可以加上 `--desktop`：

```bash
aivcli mcp serve ./project.aivproj --desktop
```

桌面模式使用按用户隔离的 Unix socket（Windows 使用 named pipe）和每次启动生成的令牌。只有匹配的 `.aivproj` 已在桌面端打开时才会进入现有确认弹窗；拒绝、过期、取消和 revision 冲突都会作为决策返回给 Agent。桥接不会提供直接 apply 工具、网络监听、任意文件访问、媒体删除、shell 或 Provider 凭据能力。只有桌面应用与 CLI 刻意使用不同用户数据目录时，才需要指定 `--bridge-manifest path`。

### 视觉影视库

```bash
aivcli library status
aivcli library scan ./Videos --recursive
aivcli library index ./Videos --recursive
aivcli library search "海边场景"
aivcli library search --image ./reference.jpg
```

### 批量处理

```bash
aivcli batch ./Videos --recursive --asr --translate zh --index --output-dir ./subtitles
aivcli batch ./Videos --recursive --asr --translate zh --index --resume
```

`batch` 可以组合 ASR、字幕翻译和影视库索引。默认单个视频失败后继续处理，并把状态保存到 AIVPlayer 用户数据目录；可以通过 `--state-file ./batch-state.json` 指定状态文件，通过 `--retry 0..5` 调整可恢复错误重试次数，通过 `--fail-fast` 遇到错误立即停止。中断后使用相同参数加 `--resume`，已完成且产物仍存在的阶段会跳过。

如果只指定 `--translate` 而不指定 `--asr`，CLI 会读取视频旁边同名的 `.vtt` 文件。指定 `--output-dir` 时，译文会追加目标语言后缀，例如 `movie.zh.vtt`，不会覆盖原文字幕。主要命令支持 `--json`，方便接入 shell、CI 或其他自动化脚本。

### AI 短剧

```bash
aivcli drama list
aivcli drama create "我的短剧" --genre "悬疑" --episodes 6
aivcli drama import <project-id> ./novel.txt
aivcli drama events generate <project-id>
aivcli drama plan generate <project-id> --stage skeleton
aivcli drama script generate <project-id> --episode 1
aivcli drama assets generate <project-id>
aivcli drama storyboard generate <project-id> --episode 1
aivcli drama provider show
aivcli drama provider test
```

完整参数可以运行 `aivcli --help`、`aivcli batch --help` 或 `aivcli drama --help` 查看。

## 安装

### 系统要求

- **macOS**：12.0 或更高版本
- **Windows**：Windows 10 或更高版本
- **Linux**：Ubuntu 18.04 或同等发行版

### 下载安装包

从 [GitHub Releases](https://github.com/ponponon/aivplayer/releases) 下载对应平台的安装包：

| 平台 | 安装包 |
| --- | --- |
| macOS | `.dmg` / `.zip` / `.pkg` |
| Windows | `.exe`（NSIS 安装器） |
| Linux | `.AppImage` / `.deb` |

Windows NSIS、macOS `.pkg` 和 Linux `.deb` 会安装 `aivcli` 启动器并加入系统命令路径。macOS `.dmg` / `.zip` 与 Linux `.AppImage` 是便携式格式，不会自动修改 PATH；使用便携式格式时可直接启动应用的 `--cli` 模式，或自行建立命令行启动器。

### 自动更新

Windows 和 Linux 正式安装包启动后会在后台检查 GitHub Releases，并自动下载适配当前平台的新版本；下载完成后，窗口顶部会出现“重启并更新”按钮，点击后才会退出并安装，不会强制中断当前播放或编辑。macOS 当前因为尚未配置 Apple Developer ID 签名和公证，暂不启用自动更新，需要从 GitHub 手动下载安装。开发模式和 `aivcli` 不参与自动更新。

自动更新依赖 GitHub 发布页中的 `latest*.yml` 元数据和对应的安装包 / 更新包，因此发布流程必须完整上传这些文件。

### 从源码构建

```bash
git clone https://github.com/ponponon/aivplayer.git
cd aivplayer
npm install
npm run dev
```

需要 Node.js 22.12.0 或更高版本。部分网络环境访问 npm、ModelScope 或 Hugging Face 时需要配置代理。

## 问题排查

### 右键“打开方式”启动时报 `Cannot find module 'apache-arrow'`

这是旧版安装包没有把 LanceDB 的运行时依赖一起打包导致的启动问题，不是视频文件名、外置硬盘路径或 MP4 编码的问题；当前 `v0.5.6` 发布包已经包含修复。请直接下载对应 Release 的安装包，不要在应用包内手动安装 npm 依赖。

当前发布版本为 `v0.5.6`，请优先使用对应 Release 的安装包。

### 字幕生成失败

先运行：

```bash
aivcli doctor
```

如果是源码开发环境，再分别检查后端和 ASR 运行时：

```bash
npm run doctor:backend
npm run doctor:asr
```

重点确认 whisper.cpp、ASR 模型和 ffmpeg 均已准备好；macOS 上如果 GPU 初始化失败，应用会针对明确的 Metal 资源错误自动回退 CPU。

### 翻译、总结或短剧生成失败

确认 OpenAI-compatible 地址、模型和 Key 配置正确，并先在对应面板执行连接测试。不要把 API Key 粘贴到 Issue、截图、终端命令或提交记录中；反馈问题时请先脱敏 URL、Key、路径和完整响应内容。

### 反馈问题时请附带

- 操作系统、AIVPlayer 版本和安装包格式；
- 复现步骤、视频格式和是否使用外置磁盘；
- `aivcli doctor --json` 中已脱敏的结果；
- 错误发生的面板或 CLI 命令，以及去除 Key 后的日志片段。

可以在 [GitHub Issues](https://github.com/ponponon/aivplayer/issues) 提交问题，也可以先在 [产品主页](https://aivplayer.pages.dev/) 查看最新功能和下载入口。

## 从源码开发

### 常用命令

```bash
npm run dev              # 启动开发模式
npm run build            # 构建生产版本
npm run preview          # 预览构建结果
npm run pack             # 打包但不生成安装程序
npm run dist             # 生成安装程序

npm run typecheck        # TypeScript 类型检查
npm run test             # 运行单元测试
npm run doctor:backend   # 检查后端依赖
npm run doctor:asr       # 检查 ASR 运行时
npm run smoke:all        # 运行主要界面回归
npm run smoke:web-format-matrix -- --ffmpeg /path/to/ffmpeg  # 真实视频格式与 Web 转码矩阵
npm run smoke:web-concurrency -- --ffmpeg /path/to/ffmpeg     # 多客户端并发、同源去重与转码队列 smoke
npm run smoke:web-real-file -- ./movie.mp4                     # 真实大文件的时长、末尾 Range 和打包 Web smoke
```

准备本地 ASR 运行时：

```bash
npm run release:prepare-runtime -- \
  --whisper-dir /path/to/whisper.cpp/build/bin \
  --ffmpeg-bin /path/to/ffmpeg
```

### 项目结构

```text
aivplayer/
├── src/
│   ├── desktop/         # Electron 主进程与桌面适配
│   ├── core/            # 桌面端与 CLI 共用的业务能力
│   │   ├── ai/          # ASR、翻译、总结和视觉影视库
│   │   ├── drama/       # AI 短剧文本工作流
│   │   └── media/       # 媒体解析与导出
│   ├── preload/         # IPC 桥接
│   ├── renderer/        # React 渲染进程
│   └── shared/          # 共享类型
├── resources/           # whisper.cpp、ffmpeg 等运行时资源
├── scripts/             # 构建、诊断和 smoke 工具
├── tests/               # 单元测试和集成测试
└── docs/
    ├── site/            # Cloudflare Pages 产品主页
    └── ...              # 发布与项目文档
```

### 技术栈

| 类别 | 技术 |
| --- | --- |
| 桌面框架 | Electron |
| 前端框架 | React 19 |
| 构建工具 | Vite + electron-vite |
| 类型系统 | TypeScript |
| 本地 ASR | whisper.cpp |
| 视觉检索 | SigLIP2 + LanceDB + Apache Arrow |
| AI 接口 | OpenAI-compatible Provider |
| 测试 | Vitest + Playwright |
| 打包 | electron-builder |

## 参与贡献

欢迎提交 Issue 和 Pull Request。建议先阅读现有的 `FEATURE.md` 和 `FailureExperience.md`，了解功能边界和已经踩过的坑。

1. Fork 本仓库。
2. 创建特性分支，例如 `git switch -c feat/amazing-feature`。
3. 完成本地类型检查和相关测试。
4. 使用 [Conventional Commits](https://www.conventionalcommits.org/) 提交更改。
5. 推送分支并创建 Pull Request。

常用提交类型包括 `feat`、`fix`、`docs`、`refactor`、`test` 和 `chore`。新增功能请同步记录到 `FEATURE.md`；修复由反馈暴露的问题时，请把可复用的经验记录到 `FailureExperience.md`。

## 开源协议

本项目基于 [MIT License](LICENSE) 开源。

## 致谢

- [whisper.cpp](https://github.com/ggerganov/whisper.cpp) — 本地语音识别引擎
- [Electron](https://electronjs.org/) — 跨平台桌面应用框架
- [React](https://react.dev/) — UI 框架
- [LanceDB](https://github.com/lancedb/lancedb) — 本地向量数据库
- [lucide-react](https://lucide.dev/) — 图标库

<p align="center">
  如果觉得有用，欢迎访问<a href="https://aivplayer.pages.dev/">产品主页</a>，或给仓库一个 ⭐ Star。
</p>
