## ASR 错误消息撑开布局
- 只给错误文本本身加 `overflow-wrap` 不一定够，长 stderr 还可能通过上层 `grid`/`flex` 容器的自动最小宽度把侧栏撑宽。
- 处理这类消息时，要同时检查并补齐父容器的 `min-width: 0`，重点是 `panel-content`、`asr-card`、`asr-stack`、`progress-block` 这类布局容器。
- 如果错误信息来自外部工具输出，优先把可视区控制在固定宽度内，再决定要不要额外提供完整详情。
