# 字幕显示设置与翻译能力设计

## 背景

播放器现在已经支持基于 whisper.cpp 的本地 ASR 字幕生成，并且会把生成的 VTT / SRT 缓存在本地。当前主播放区下方有一个独立字幕栏，由 `SubtitleOverlay` 读取 VTT 文件、解析 cue，并根据当前播放时间渲染文本。

用户希望字幕栏可以便捷调整字号等显示效果，并且后续支持把日语、英语等源语言字幕翻译成中文显示。

## 目标

第一阶段先实现字幕显示设置，让用户能在播放界面快速调整字幕栏字号，并把偏好保存到本地设置。

第二阶段为字幕翻译能力预留清晰的数据模型和 UI 边界，后续可以把日语、英语等 ASR 原文字幕翻译成中文，并支持原文、译文、双语显示。

## 非目标

- 第一阶段不实现真实机器翻译调用。
- 第一阶段不改 whisper.cpp 的 ASR 工作方式。
- 第一阶段不做字幕编辑器，也不提供逐句人工修订能力。
- 第一阶段不做复杂主题编辑，只覆盖字号、行高、显示模式等高频设置。

## 现状

- `src/renderer/src/subtitle-overlay.tsx` 负责读取字幕文件、解析 cue、显示当前字幕文本。
- `src/renderer/src/subtitle-parser.ts` 负责解析 VTT，并输出 `{ startSeconds, endSeconds, text }`。
- `src/renderer/src/styles/player.css` 里 `.subtitle-overlay` 和 `.subtitle-text` 固定了当前字幕栏样式。
- `src/shared/app-settings.ts` 里已有 `asr` 设置分组，保存 ASR 模型源、默认识别语言、自动加载缓存等生成类配置。
- 设置页已有字幕分组，但目前只包含 ASR 相关设置。
- 右侧 `subtitles` 面板目前是空状态，没有承担字幕轨道和显示控制职责。

## 设计决策

采用“播放器即时控制 + 设置中心持久配置 + 翻译管线预留”的方案。

原因：

- 字幕显示设置是高频体验项，应该能在播放时直接调整。
- 字幕偏好又属于长期配置，需要进入设置中心持久化。
- 翻译能力会引入额外缓存、任务状态、服务配置和显示模式，不能把翻译结果硬塞进原始 ASR 字幕。

## 配置模型

新增 `AppSettings.subtitles` 分组，承载字幕显示和翻译显示偏好。`asr` 保持只负责字幕生成相关配置。

建议字段：

```ts
type SubtitleDisplayMode = 'source' | 'translation' | 'bilingual'
type SubtitleLineHeight = 'compact' | 'normal' | 'relaxed'

type AppSettings = {
  subtitles: {
    fontSizePx: number
    lineHeight: SubtitleLineHeight
    displayMode: SubtitleDisplayMode
    targetLanguage: SubtitleLanguageId
  }
}
```

默认值：

- `fontSizePx`: 14，和当前视觉接近。
- `lineHeight`: `normal`，对应当前 `1.5`。
- `displayMode`: `source`，避免没有翻译字幕时出现空态误解。
- `targetLanguage`: `zh`，因为用户核心场景是外语视频显示中文字幕。

主进程 `app-settings` sanitizer 需要限制：

- `fontSizePx` 范围为 12 到 28，四舍五入为整数。
- `lineHeight` 只接受 `compact / normal / relaxed`。
- `displayMode` 只接受 `source / translation / bilingual`。
- `targetLanguage` 复用现有 `SubtitleLanguageId` 校验，但第一阶段 UI 只展示中文目标语义。

## 播放器字幕栏

`SubtitleOverlay` 增加显示设置入参：

- `fontSizePx`
- `lineHeight`
- `displayMode`
- 后续翻译实现后再接收 `translationSubtitlePath`

第一阶段只显示原文字幕，并用 CSS 变量驱动样式：

- `--subtitle-font-size`
- `--subtitle-line-height`

`.subtitle-text` 使用这些变量，避免后续继续散写固定字号。

字幕栏右侧增加一个轻量设置入口，使用项目已有的 lucide 图标体系。入口建议放在字幕栏内部右侧，而不是塞进底部播放控制条，原因是它只影响字幕栏，不影响播放行为。

快捷浮层提供：

- 字号减小按钮
- 当前字号数字
- 字号增大按钮
- 行高选择
- 显示模式选择，第一阶段如果没有译文缓存，译文和双语选项置灰或显示为预留状态
- 恢复默认

浮层沿用当前 `.subtitle-actions` 这类 details / absolute menu 模式，展开时脱离文档流，避免撑高字幕栏或挤压底部控制栏。

## 设置中心

设置页的“字幕”分组补充“显示”小节：

- 字幕字号：使用现有 `SettingsNumberInput`。
- 行高：使用现有 `SettingsSelect`。
- 默认显示模式：使用现有 `SettingsSelect`。
- 目标翻译语言：使用现有 `SettingsSelect`，第一阶段默认中文。

所有新增控件继续走 `SettingsField / SettingsSelect / SettingsNumberInput`，不要在设置页里直接手写表单 DOM。

## 右侧字幕面板

后续把右侧 `subtitles` 面板从空状态升级为字幕轨道中心：

- 当前原文字幕状态：未加载 / 缓存已就绪 / 已挂载。
- 翻译字幕状态：未翻译 / 翻译中 / 已缓存 / 失败。
- 显示模式切换：原文 / 译文 / 双语。
- 字幕文件操作：打开 VTT / SRT、复制路径、打开缓存目录。

第一阶段可以不完全实现右侧面板，但字段和文案要为后续翻译状态留好位置。

## 翻译管线

翻译不放进 whisper.cpp。whisper.cpp 继续只负责从视频音频生成源语言 VTT / SRT。翻译作为 ASR 后处理任务：

1. 读取源 VTT。
2. 用现有 VTT parser 得到 cue 列表。
3. 按 cue 文本批量请求翻译 provider。
4. 校验翻译结果数量和 cue 数量一致。
5. 写出翻译 VTT / SRT。
6. 生成可挂载的本地 URL。
7. UI 切换到译文或双语显示。

翻译 provider 使用适配器接口，避免一开始绑定单一服务：

```ts
type SubtitleTranslateProvider = {
  id: string
  label: string
  translateCues(request: SubtitleTranslateRequest): Promise<SubtitleTranslateResult>
}
```

后续可以接：

- OpenAI-compatible API。
- 本地 LLM 服务。
- 专门翻译 API。

因为用户在中国大陆网络环境下工作，在线 provider 需要允许配置代理或复用系统代理。实现前要先确定具体 provider，再按项目代理规则测试可用性。

## 翻译缓存

翻译缓存不能只按媒体文件命名。缓存 key 必须包含：

- 媒体路径。
- 媒体修改时间。
- ASR 模型 ID。
- 源字幕内容 hash。
- 源语言。
- 目标语言。
- 翻译 provider ID。
- 翻译模型名或版本。

建议输出：

- `*.translated.zh.vtt`
- `*.translated.zh.srt`
- `*.translated.zh.meta.json`

meta 文件记录 provider、模型、源字幕 hash、生成时间和错误恢复信息，方便后续排查“字幕看起来不是最新”的问题。

## 双语显示

双语显示不修改源字幕文件，而是在渲染层把同一时间点的 source cue 和 translation cue 组合：

- 源字幕保持原文行。
- 译文单独作为第二行。
- 如果某一侧缺失，另一侧仍正常显示。

这样可以避免翻译失败或缓存丢失时破坏原始 ASR 结果。

## 错误处理

- 字号、行高、显示模式读取到非法值时回退默认值。
- 没有字幕文件时，字幕栏不显示设置浮层的翻译相关可用态。
- 用户选择译文模式但没有译文缓存时，显示原文并给出轻量提示，不展示空白字幕。
- 翻译 provider 返回数量不一致时，不写入缓存；可以拆小批重试。
- 翻译任务失败时保留源字幕，不影响正常播放。
- 翻译缓存命中失败时只影响译文轨道，不影响 ASR 原文缓存。

## 测试计划

单元测试：

- `createDefaultAppSettings` 包含字幕显示默认值。
- `readAppSettings` 能清洗非法字幕显示配置。
- `updateAppSettingsSection` 支持新的 `subtitles` section。
- `SubtitleOverlay` 或样式源测试确认字号通过设置传入，而不是固定写死。
- 翻译缓存 key helper 后续要覆盖源字幕 hash、目标语言、provider 和模型版本。

源码约束测试：

- 设置页新增字幕显示控件继续通过 `SettingsField / SettingsSelect / SettingsNumberInput` 渲染。
- `.subtitle-text` 不再固定 `font-size: 14px`，而是使用 CSS 变量。

Smoke 测试：

- 新增 `smoke:subtitle-settings`，打开测试视频，生成或加载字幕后调整字号，校验 `.subtitle-text` computed style。
- 后续翻译实现时新增 `smoke:subtitle-translation`，使用 mock provider 生成中文译文，验证显示模式切换。

## 实现顺序

1. 新增 `AppSettings.subtitles` 类型、默认值、sanitizer 和测试。
2. 改造 `SubtitleOverlay`，用设置驱动字号和行高。
3. 在字幕栏增加快捷设置浮层。
4. 在设置页字幕分组补充显示设置。
5. 增加 FEATURE.md 记录字幕显示设置能力。
6. 增加 typecheck、unit test 和 smoke 验证。
7. 后续单独进入翻译实现计划，新增翻译 IPC、缓存、provider adapter 和 UI 状态。

## 验收标准

- 用户可以在播放器字幕栏直接调整字号。
- 调整后的字号立即作用到当前字幕文本。
- 重新打开应用后字幕字号仍然保持。
- 设置页可以修改同一份字幕显示偏好。
- 没有字幕时播放器布局不被空的设置入口撑乱。
- 翻译功能的后续实现不会污染原始 ASR 字幕缓存。
