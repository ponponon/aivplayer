# AIVPlayer 功能列表

## 核心播放
- 本地视频播放器，支持拖拽导入和文件选择导入。
- 播放列表支持切换上一条 / 下一条，支持键盘快捷键。
- 支持音量、倍速、全屏和时间轴拖动控制。

## 本地 ASR 字幕
- 基于 whisper.cpp 的离线字幕生成流程。
- 支持模型下载、运行时检测、自动检测 whisper 引擎、手动选择引擎。
- 支持字幕缓存，重复生成同一视频时优先命中本地结果。

## 模型下载
- 推荐模型支持国内 ModelScope 和国际 Hugging Face 两个来源。
- 下载进度在侧边栏展示，方便定位卡顿或失败。

## ASR 二进制兼容
- 自动识别 `whisper-whisper-cli`、`whisper-cli`、`whisper-cpp`、`main` 这几类 whisper.cpp 可执行文件。
- 如果用户选到的是 deprecated wrapper，运行时会优先切换到同目录下真正可用的二进制。
- 资源打包时尽量保留识别到的原始二进制文件名，避免把新版本 whisper.cpp 再改回旧名字。
