## ASR 错误消息撑开布局
- 只给错误文本本身加 `overflow-wrap` 不一定够，长 stderr 还可能通过上层 `grid`/`flex` 容器的自动最小宽度把侧栏撑宽。
- 处理这类消息时，要同时检查并补齐父容器的 `min-width: 0`，重点是 `panel-content`、`asr-card`、`asr-stack`、`progress-block` 这类布局容器。
- 如果错误信息来自外部工具输出，优先把可视区控制在固定宽度内，再决定要不要额外提供完整详情。

## whisper.cpp 二进制名迁移
- 不能只在运行时找旧名字，还要同步改打包脚本和 bundle 校验脚本，否则 release 里会继续把新二进制改回旧名字。
- 当 whisper.cpp 输出 “Please use 'xxx' instead” 这类迁移警告时，要把它当作可解析的兼容信号，优先切到推荐的 replacement binary，而不是继续沿用旧路径。
- 在“同一目录里找可执行文件”时，不能依赖 `readdir` 的返回顺序；必须按候选名优先级显式匹配，否则目录里同时存在新旧两个名字时还是可能选回旧的。
- 如果自动切到兼容二进制，UI 和 IPC 返回值都要以“最终实际使用的路径”为准，不要拿用户最初点选的旧路径当成功判定。

## whisper.cpp 状态信息不要拿 help 输出充数
- 健康检查里展示给 UI 的“版本号”必须来自 `--version`，不能把 `--help` 的首行 `usage:` 误当成版本信息。
- 外部 CLI 的长 help / stderr / usage 只能进日志或详情块，不能直接塞进状态卡片的主文案，否则很容易把侧栏撑坏。
