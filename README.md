# AIVPlayer

> 一款现代化的跨平台桌面视频播放器，支持本地 AI 字幕生成

## 核心特性

- 🎬 **本地视频播放** - 支持 MP4、WebM、MOV、MKV、AVI 等常见格式
- 🎤 **AI 字幕生成** - 基于 whisper.cpp 的本地 ASR，支持多语言语音识别
- 🎨 **现代 UI 设计** - 深色影院风格，视频优先，控制栏自动隐藏
- 📦 **跨平台支持** - macOS、Windows、Linux 三平台打包

## 安装

### 开发环境

```bash
# 克隆项目
git clone <repository-url>
cd aivplayer

# 安装依赖（需要代理访问 npm）
npm install

# 启动开发环境
npm run dev
```

### 正式安装包

从 [Release 页面](https://github.com/ponponon/aivplayer/releases) 下载对应平台的安装包：

- macOS：`.dmg` 或 `.zip`
- Windows：`.exe` (NSIS)
- Linux：`.AppImage`

## 快速开始

1. 启动 AIVPlayer 应用
2. 拖入视频文件到窗口，或点击"打开视频"按钮选择文件
3. 使用底部控制栏播放、暂停、调节音量和进度
4. 如需生成字幕：
   - 切换到右侧面板的 "ASR" 标签
   - 首次使用需下载推荐模型（支持国内 ModelScope 和国际 Hugging Face 源）
   - 点击"生成当前视频字幕"按钮
   - 生成完成后字幕会自动加载显示，字幕文件会缓存到用户数据目录下的 `asr-cache/subtitles/`
   - 同时会产出 `.vtt` 和 `.srt` 两份字幕文件，其中 VTT 用于播放器挂载，SRT 便于后续导出或外部工具使用
   - 生成后可点击字幕卡片右上角的文件夹图标，直接打开字幕缓存文件所在位置，也可以点下方按钮直接定位 SRT 文件

## 开发指南

### 可用命令

```bash
npm run dev              # 启动开发环境
npm run build            # 构建项目
npm run preview          # 预览构建结果
npm run typecheck        # TypeScript 类型检查
npm run test             # 运行单元测试

npm run doctor:backend   # 检查后端依赖（mpv）
npm run doctor:asr       # 检查 ASR 运行时（whisper.cpp）

npm run pack             # 打包（不发布）
npm run dist             # 完整打包流程（含运行时检查）
```

### 项目结构

```
aivplayer/
├── src/
│   ├── main/            # Electron 主进程
│   │   ├── index.ts     # 应用入口
│   │   ├── ai/          # ASR 相关模块
│   │   └── media/       # 媒体播放模块
│   ├── preload/         # 预加载脚本
│   ├── renderer/        # React 渲染进程
│   │   ├── src/
│   │   │   ├── app/     # 应用组件
│   │   │   ├── lib/     # 工具函数
│   │   │   └── styles/  # 样式文件
│   │   └── index.html
│   └── shared/          # 共享类型定义
├── tests/               # 测试文件
├── scripts/             # 工具脚本
├── resources/           # 运行时资源
└── docs/                # 文档
```

### ASR 运行时

AIVPlayer 使用 whisper.cpp 作为 ASR 引擎，正式安装包已内置：

- `resources/whisper.cpp/` - whisper.cpp 可执行文件（名称取决于上游版本）
- `resources/ffmpeg/` - ffmpeg 音频处理工具
- 生成的字幕默认缓存到 `~/Library/Application Support/AIVPlayer/asr-cache/subtitles/`（macOS），其他平台则在各自的用户数据目录下。
- 同一份字幕任务会同时生成 `.vtt` 和 `.srt`，前者挂载到播放器，后者保留为可复用的文本字幕。

开发调试时可手动选择系统安装的 whisper.cpp 可执行文件：

```bash
# 检查 ASR 运行时状态
npm run doctor:asr

# 准备 ASR 运行时（用于打包）
npm run release:prepare-runtime -- \
  --whisper-dir /path/to/whisper.cpp/build/bin \
  --ffmpeg-bin /path/to/ffmpeg
```

## 技术栈

| 类别 | 技术 |
|------|------|
| 桌面框架 | Electron |
| 前端框架 | React 19 |
| 构建工具 | Vite + electron-vite |
| 类型系统 | TypeScript |
| 图标库 | lucide-react |
| ASR 引擎 | whisper.cpp |
| 测试框架 | Vitest |
| E2E 测试 | Playwright |
| 打包工具 | electron-builder |

## 许可证

MIT License

## 作者

ponponon
