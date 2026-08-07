## Electron GPU 参数必须在 ready 前同步决定
- `app.commandLine.appendSwitch()` 不能等待异步设置文件读取后再调用；主进程应为启动早期需要的偏好提供同步、最小化读取入口，否则 Chromium 可能已经初始化，开关只会部分传播到子进程。
- “开启 GPU”不能用 `--no-zygote` 代替，进程启动方式和硬件加速是两个独立语义；遇到 Linux GPU 合成失败时，应该只在明确关闭或环境强制时追加 `disable-gpu` / `disable-gpu-compositing`。
- Renderer 的 `window.location.reload()` 不会重新初始化 Electron 主进程，也不会重新应用 command-line switch；涉及启动参数的设置必须先等待落盘，再通过主进程 `app.relaunch()` 重启。
- `electron-vite dev` 会在 Electron 子进程退出时让 dev server 一起退出；开发环境不能直接用 `app.relaunch()`，否则新 Electron 进程会失去 Renderer dev server 而黑屏。需要由外层 supervisor 根据专用退出码重启整个 dev server。

## UI 操作按钮不能允许文案在 flex 中被压缩换行
- 设置页底部操作区同时放置说明文字和操作按钮时，按钮组必须保持不可压缩，按钮文案必须 `white-space: nowrap`；否则另一个 `width: 100%` 的按钮会挤压相邻按钮，中文标签会被断成两行。
- 窄屏适配应让按钮组整体换行，而不是让单个按钮内部换行；共享的次要按钮和 ASR 操作按钮需要统一遵循这个规则，避免同一问题在缓存、引导和面板操作中重复出现。

## 高频主题切换不能只放在设置里
- 主题模式虽然需要保留“浅色 / 深色 / 跟随系统”的精确选择，但一键切换属于高频操作，不能只藏在设置弹窗；标题栏工具组应提供可见的主题按钮，手动模式在浅色和深色之间切换，跟随系统模式按当前系统主题切换到另一种，设置页继续负责恢复三态选择。

## Release 工作流不能让隐式发布和可选 artifact 互相打架
- Ubuntu 24.04 GitHub Runner 的仓库不提供 `libkvazaar-dev`，不能把它作为 Linux 发布前置依赖；libheif 的 Linux CI 编译应使用 Runner 可用的 x265 开发包，并同步修改 encoder 参数，先在真实 Runner 上验证 apt 安装步骤。
- Ubuntu 24 的新版 `jpeglib.h` 会让固定版本 libheif 的 `jpeg_write_icc_profile` 兼容声明在 C++ 编译阶段冲突；Linux CI 构建该固定源码时需要显式使用 `CXXFLAGS=-fpermissive`，不能只看 CMake configure 成功。
- Ubuntu 的 `libx265-dev` 提供动态库时，不能继续给 libheif 传 `--static-link`；否则会在链接阶段报 attempted static link of dynamic object。Linux 包应依赖系统 FFmpeg/编解码运行库，macOS/Windows 再分别使用各自的静态或自包含方案。
- electron-builder 在 tag 构建且设置 `GH_TOKEN` 时会触发隐式 GitHub / Snap Store 发布；如果工作流同时还有独立的 artifact 汇总和 Snapcraft 发布 job，就会出现重复上传、Linux job 依赖本机 snapcraft，甚至平台构建阶段先于正式 release 发布的问题。平台构建必须显式使用 `--publish never`，发布动作统一收口到后置 job。
- Chocolatey 安装 FFmpeg 后，Windows Runner 上的 `Get-Command ffmpeg` 可能只返回 `C:\ProgramData\Chocolatey\bin` 下的 shim；不能把这个 shim 当作可携带运行库。发布脚本必须从 Chocolatey 的实际 `lib\ffmpeg` 安装目录解析 `ffmpeg.exe` 和同目录的 `ffprobe.exe`，再暂存到应用资源中并执行验证。
- Snap 构建依赖 Snap Store、core22、snapcraft 和网络，单次 `snap install` 或 `snapcraft pack` 失败不能直接等同于配置错误；安装和打包要做有上限的指数退避重试，并且重试循环最后一次失败必须显式 `exit 1`，不能让最后一个 `sleep` 把失败步骤伪装成成功。
- `publish-snap` 不能只依赖 `publish-release`，否则 `build-snap` 失败后 release 仍会成功、后置 job 再因找不到 artifact 产生第二个红色失败。汇总 release 必须等待真正会上传的 artifact，后置发布 job 也要直接依赖产物 job，确保失败原因只保留在最初失败点。
- Snapcraft 的 `pack` 失败后不能在同一个 `parts` / `stage` / `prime` 状态上直接重试；dump part 可能已经留下部分安装文件，下一次会把原本的根因放大成大量 `cp ... File exists`。每次重试前必须清理 Snapcraft 生成目录和旧 `.snap`，再从干净状态重新打包。

## Electron 打包不能依赖自动安装的 peer dependency

- `@lancedb/lancedb` 的运行时代码会直接 `require("apache-arrow")`，但它把 Apache Arrow 声明为 peer dependency。npm 在开发机上可能把这个 peer 自动安装到顶层 `node_modules`，造成开发态误以为依赖完整；electron-builder 只按应用的生产依赖收集资源时则可能把它漏出 `.app`，最终主进程在启动阶段报 `Cannot find module 'apache-arrow'`。
- Electron 主进程会在应用启动时加载视觉影视库服务，所以 Finder 的“打开方式”只是暴露问题的入口，视频文件名、外置磁盘路径和 MP4 编码都不是根因。凡是被打包运行时代码直接 require 的 peer dependency，都必须在根 `package.json` 的 `dependencies` 中显式固定版本，并通过生产构建检查实际进入应用资源。
- Snapcraft dump plugin 默认用 `cp --link` 把 Electron 的 `linux-unpacked` 目录放进 part install；当前 Electron 产物包含多平台原生模块和大量文件，GitHub runner 上会在复制阶段只返回 `None` 而退出 1，日志没有给出可操作的源文件。对已生成的本地目录不要继续依赖 dump plugin，改用 nil plugin + `CRAFT_PART_INSTALL` + 普通 `cp -a` 显式复制，才能把构建产物稳定送入 Snap。
- Snapcraft 的 `apps.<name>.desktop` 路径必须和仓库中的 `snap/gui/*.desktop` 真实路径一致；只把文件放在 `snap/local` 并不能满足 metadata 生成阶段，最终会在 `Copying snap assets` 报 `file does not exist`。
- Snapcraft 9 已移除 `snapcraft login --with -` 参数；GitHub Actions 发布 Snap 时应把 `SNAPCRAFT_STORE_CREDENTIALS` Secret 注入上传步骤，让 Snapcraft 从环境变量读取凭据，否则会以退出码 64 失败。

## 真实翻译 smoke 不要把 API Key 写进仓库
- 真实接口回归需要覆盖应用 IPC 和 renderer overlay，但 Key 不能进入产品源码、默认设置或 smoke 脚本常量。
- 更稳妥的方式是让 smoke 默认使用本地 Mock，只有通过临时环境变量提供接口地址、模型和 Key 时才切换真实模式；用户目录必须隔离，并在 `finally` 中递归清理。
- 真实模式下不能继续依赖 Mock 的“取消按钮一定出现”或固定译文文本，等待条件应该只验证翻译成功、overlay 文本不再是原文、以及重启后的译文缓存恢复。

## 目标语言选择必须连接到翻译动作
- 目标语言按钮如果只写回设置、不启动缓存查找或翻译请求，用户会看到目标语言已经选中，但字幕栏仍停留在原文，随后“译文”显示模式也会因为没有译文文件而变成灰色。
- 目标语言快捷操作应该把目标语言作为显式参数传入翻译函数，不能在同一次点击里依赖尚未完成的 React state 更新；当前已选语言也应允许点击，用于首次生成或重试译文。
- ASR 状态里不要只保存已经本地化的整句文案；至少同时传递结构化的版本信息，让 renderer 能按当前 locale 重新生成状态文案，避免切换界面语言后残留韩文、英文等旧文案。

## 翻译上下文不能混进待返回 cue
- 为了保持跨句术语和指代，批次请求可以携带前后 cue 以及上一批译文，但这些内容必须明确标为 reference-only，且当前批次的字幕数组仍然单独传给模型。
- 解析响应时只接受当前批次的 id；上下文 cue 即使被模型回传，也不能让它进入最终 VTT / SRT，否则会出现重复字幕或时间轴错位。
- 上下文策略如果是固定协议，缓存键不需要因为每次请求的邻近文本重复膨胀；只有真正改变翻译规则的用户设置才应该参与缓存版本。

## 术语表必须参与缓存上下文
- 用户修改固定译法后，不能继续命中旧术语生成的译文缓存，否则设置页看起来保存成功，播放器实际仍显示旧翻译。
- 术语输入要在设置写回时规范化，只保留 `原词=固定译词` 的有效行并限制总长度；prompt 层再解析成结构化映射，避免把格式错误的长文本直接发送给模型。
- 术语表属于翻译规则，不属于字幕源文本；应参与译文缓存键和当前结果匹配，但不应进入字幕源文件或 ASR 缓存命名。

## Metal GPU 资源失败要自动回退 CPU
- macOS 上 whisper.cpp 可能在初始化 Metal buffer 时直接以 139 / `SIGSEGV` 退出，不能把这类资源问题当成普通字幕识别失败，否则用户只会看到生成按钮失败，却不知道 CPU 仍然可以完成任务。
- 运行时应该只针对明确包含 `ggml_metal_buffer_init` 或 `failed to allocate buffer` 的 GPU 资源错误追加 `-ng` 重试，不能对所有退出码盲目重跑，否则真实的模型、音频或参数错误会被掩盖。
- 回退前要清理可能留下的半成品 VTT / SRT / JSON，避免第二次成功后混入第一次崩溃留下的脏 sidecar。
- 真实回归不能只用预制字幕缓存；应该用实际模型、实际视频和隔离的 ASR cache 验证应用 IPC、缓存落盘、语言 JSON 和 `<track>` 挂载。因为模型很大，这类 smoke 应单独提供入口，不要塞进默认全量回归。

## Electron 开发态资源路径不能直接依赖 process.resourcesPath
- 直接用 `process.resourcesPath` 启动 `out/main/index.js` 时，路径可能落到 Electron 自己的 `Electron.app/Contents/Resources`，而不是仓库的 `resources/`。
- 资源解析应该区分 `app.isPackaged`：开发态使用项目资源目录，打包态才使用 `process.resourcesPath`；同时保留显式环境变量覆盖，便于 CI 和 smoke 指定资源位置。

## 设置页数字输入不要在变体里改对齐
- 同一语义的数字输入控件必须把文本对齐、数字字形这类视觉规则放在基础类上，不能让普通版和 compact 版分别写 `right` / `center`，否则同一设置页会出现一眼可见的不统一。
- compact 这类变体应该只改宽度、间距这类尺寸属性；如果要改视觉语义，先补源码约束测试，避免后续新增设置项继续复制出第二套规则。
- 数字输入建议使用 `font-variant-numeric: tabular-nums`，这样多位数和个位数在同一个控件族里更稳定，不会因为字形宽度造成轻微漂移。
- 这种 UI 对齐问题最好配一条可运行的 smoke screenshot 脚本，直接打开 settings dialog、切到 interface section 并校验 `.settings-number` 的 computed style，避免以后只剩源码测试而丢了可视化回归。
- smoke 脚本最好先根据当前 locale 选对“打开设置”按钮文案，不然一旦用户切过语言，回归脚本会先死在入口按钮而不是死在真正需要验证的布局上。
- 如果要额外验证多语言布局，最好把 smoke 脚本做成可参数化的 locale 覆盖入口，而不是硬拷贝两份脚本；这样既能保留默认语言回归，也能单独跑英文/其他语言，维护成本更低。
- 当多语言 smoke 已经拆成多个 locale 入口时，最好再补一个 `:all` 聚合命令，让完整回归变成一条命令，而不是靠人手拼四次；这样更容易在真正改版前把所有语言跑一遍。
- smoke 的运行目录最好每次都用独立的临时 HOME，别复用固定目录；否则上一次跑出来的 locale 和配置会污染下一次回归，导致结果不稳定。
- smoke 的截图文件也最好放在对应的临时 HOME 里，不要写到固定 tmp 路径上；否则默认语言和英文语言跑完后只会剩最后一张图，排查时缺少证据链。
- 当应用支持多个 locale 时，smoke 的 package 入口最好按 locale 一次性补齐，而不是只留默认值和一两个示例入口，不然回归覆盖会随着语言支持扩展慢慢漏掉。
- smoke 脚本里要点按按钮或等待弹窗时，别再把某个 locale 的文案写死在脚本里；应该先从 `getAppCopy(appSettings.ui.locale)` 取当前语言词条，再拿这些词条去找控件，不然一切到英文 / 日文 / 韩文，等待条件就会先失效。
- 像剪辑导出和媒体详情这种高频弹窗，最好同样给出 `smoke:...` 入口并统一一个 `:all` 聚合命令，别只给设置页配完整回归，其他弹窗却继续裸奔。
- 当项目已经有 settings、dialogs 和 open-video 三类 smoke 时，最好再往上收一个真正的 `smoke:all` 总入口，别让回归入口散成三四串，做一次完整检查还得人手拼命令。
- 设置页表单控件的高度、横向 padding、圆角不要分散写在 `select / number / path / button` 各自规则里；应该在设置域上定义局部 CSS 变量，让同类控件共享同一底座，后续只改一个地方就能整体对齐。
- 原生 `select` 不能只靠 `min-height` 控制高度，否则浏览器默认控件可能实际渲染得更高；需要和 `number` 输入一样用明确的 `height` 才能避免控件族再次出现高低不齐。

## 设置入口和系统应用名要用真实产品语义
- 设置入口这种强约定动作应该优先使用齿轮图标，不能用滑杆图标替代，否则用户会把它理解成“调节/筛选”而不是应用设置。
- macOS 开发态如果没有显式 `app.setName` 和应用菜单模板，系统菜单栏会显示 Electron 默认名称；只设置窗口标题或打包配置不够。
- macOS 菜单栏属于 Electron 主进程状态，renderer 热更新不会刷新它；改完主进程后必须重启 `electron-vite dev` 或重新打开构建产物再验收。
- 设置弹窗这种双列卡片布局里，不要再让表单项内部也强行左右两列；卡片宽度不足时说明文字会被压到竖排，应该优先采用说明在上、控件在下的稳定结构。
- 设置弹窗的双列 grid 不要默认拉伸卡片：右侧字幕翻译配置变长时，`.settings-grid` 的默认 `align-items: stretch` 会把左侧视频 / 播放卡片撑出大块空白；应让卡片按自身内容高度从顶部对齐。
- 设置弹窗不能让当前 tab 的内容高度决定外层窗口高度，否则从视频等短分组切到字幕等长分组时窗口会反复变高变矮。应固定弹窗的视口自适应高度，把当前分组放进独立滚动区域，并用 `scrollbar-gutter: stable` 消除滚动条出现/消失带来的横向抖动。

## 原生 title 不等于可靠的可见 Tooltip
- 用户要求“鼠标悬停显示完整内容”时，不能只给元素加 `title` 就当完成；Electron / Chromium 的原生 title 显示有延迟、样式不可控，也不一定符合用户对“可见浮层”的预期。
- 对明确的 UI 交互需求，应该实现项目内可控的 tooltip / popover，至少要能在 hover 和键盘 focus 时稳定显示，且要考虑滚动容器、窄侧栏、文本换行和左右边界。
- 验证这类修复时不能只跑 typecheck，要实际对照目标 DOM 和 CSS 看浮层是否可见；必要时补一个组件级测试，确保不是继续依赖原生 title。

## Playwright 浏览器“已安装”不等于“当前可直接用”
- 不能只看到 `ms-playwright` 目录里有 Chrome / headless shell 二进制，就直接判断 Playwright 完全可用；还要确认 `playwright.chromium.executablePath()` 指向的 revision 是否真的存在，以及当前进程能否成功启动。
- 如果实际报错来自 macOS 的进程隔离、`bootstrap_check_in` 或 `SIGABRT`，那说明问题已经从“有没有安装”变成“当前环境能不能 launch”，这两件事要分开判断。
- 以后排查时要同时看三层证据：文件系统里是否有二进制、Playwright 解析出的路径是否正确、真实启动时的系统错误是什么，不能只凭其中一层下结论。

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

## 字幕缓存要在“打开文件”时主动探测
- 不能只在“生成字幕”按钮里判断缓存是否存在；同一个视频重新打开时，必须先按媒体路径和模型 ID 主动探测缓存，才能让按钮文案、字幕轨道和播放器挂载状态同步。
- 如果探测到了缓存，就应该直接回填到 `activeSubtitle`，这样 `<track>` 会自动挂上去；如果只更新文案不回填轨道，用户会看到“有字幕但没挂载”的假象。

## “打开文件”和“在文件夹中显示”不能混用
- `shell.showItemInFolder` 只是把目标文件在 Finder / 资源管理器里定位出来，不会真的用默认应用打开文件。
- 如果菜单文案写的是“打开 SRT 文件”，就必须走真正的打开文件 IPC，例如 `shell.openPath`，否则 UI 语义和实际动作会不一致。

## 字幕工具入口不要挂在标题栏上
- 字幕卡片标题区应该尽量只放主标题和必要状态，辅助动作更适合放在正文里，或者做成明确的“字幕工具”触发。
- 如果标题栏右侧用了 folder 这类强语义图标，用户很容易误以为它和下面的“打开字幕文件夹”是重复入口。
- 主操作已经是“生成当前视频字幕”时，辅助操作更应该弱化图标感，减少“同一块区域里有两个相似入口”的压迫感。

## 剪辑入口要放在顶部全局工具栏

- 剪辑是独立的媒体创作工具，不属于播放控制动作；放在播放、音量、倍速、全屏同一行会让用户误以为它只是“当前播放位置的快捷操作”。
- 剪辑入口应放到窗口顶部的全局工具栏，和打开媒体、面板切换等应用级动作并列，同时从播放控制栏移除，避免同一功能出现多个语义层级。
- 剪辑 smoke 不应先点击 ASR 面板或字幕工具菜单；应直接点击顶部工具栏的稳定选择器，验证剪辑入口真正独立于 ASR 工作区。

## 剪辑预览要沿用视频原始纵横比

- 预览画布可以保持统一的横向工作区，但不能把 `<video>` 强制设成 `width: 100%` 和 `height: 100%`；这会让 9:16 竖屏素材在预览中出现拉伸或裁切。
- 预览视频应使用自然宽高，配合 `max-width`、`max-height` 和居中布局容纳在画布内，处理方式要和主播放器的竖屏视频规则保持一致。
- 验收剪辑预览时要使用真实的 9:16 文件（例如 `享界s9二手车.mp4`），不能只用横屏样例，否则这个问题很容易被漏掉。

## 图片预览也必须沿用原图纵横比

- 不能因为图片编辑使用了新的 `.image-preview-*` DOM / CSS，就重新写一套“填满画布”的图片规则；图片预览和剪辑预览必须复用 `media-preview-constraints.css` 的同一套约束：媒体元素使用 `width: auto`、`height: auto`，再用 `max-width`、`max-height` 限制在容器内。
- 这次回归的根因是只写了 `max-width` / `max-height` 和 `object-fit: contain`，但没有明确禁止 grid item 的尺寸拉伸；`object-fit` 也不能替代元素本身的自然尺寸约束。
- 后续新增任何图片 / 视频预览时，必须同时检查横屏、竖屏和极端长图，不能只用正方形样例；源码约束测试要锁定 `auto + max-*` 组合，Electron smoke 要检查真实 DOM bounding box 的纵横比。
- “预览画布”和“媒体元素”必须分开定义：画布负责居中和裁剪，媒体元素负责自然尺寸和最大边界；不要把 `width: 100%` / `height: 100%` 直接写在媒体元素上。
- 以后新增预览组件时，必须接入 `media-preview-frame` / `media-preview-content`，并由源码测试检查 class 接入；不允许只复制一部分尺寸规则到新的 feature CSS。

## 字幕区状态文案要短
- “缓存已就绪 / 已挂载 / 等待生成”这类短状态比长句更适合放在卡片正文里，能减少视觉噪音。
- 说明文字负责解释格式和缓存规则，状态标签负责提示当前进度，两者不要混成一段长文案。

## 状态标签要在空状态也可见
- 字幕卡片里的状态标签不能只在已有缓存后才展示，不然用户在“等待生成”的时候反而看不到当前阶段。
- 空状态也要明确告诉用户“等待生成”，这样卡片的状态语义才是完整的。

## 工具菜单要脱离文档流
- 右上角那种“工具”菜单如果直接占据布局流，展开时会把左侧内容顶开，看起来像整个卡片塌了。
- 更稳妥的做法是把菜单做成绝对定位的浮层，只让 summary 占位，展开内容悬浮覆盖在卡片上。

## 信息 tab 不能用空壳占位
- “信息” tab 如果只是一个 `panel-empty`，就会表现成大块空白和一个孤零零的文件名，用户会怀疑信息丢了。
- 应该直接渲染可读的媒体属性卡片，比如文件名、路径、播放进度、字幕状态，让这个 tab 真正承担信息展示职责。

## 信息 tab 的短信息要用 compact 卡片
- 播放速度、音量、字幕状态这类短字段不要继续堆成单列长文本，否则信息区会显得松散，圆角矩形的边界也会不稳定。
- 更稳妥的方式是用两列 compact 卡片承载短字段，让每个状态都有清晰的容器和间距，避免“有内容但看起来像空白”的错觉。

## 信息和设置图标要分家
- `信息` 入口应该使用 `Info` 这类信息语义图标，不要继续占用齿轮，不然以后设置页上线时一定会撞语义。
- 齿轮要留给真正的“设置”入口，比如设置弹层、设置页或设置菜单，不要拿来表示只读的媒体信息。
- 如果按钮只是切换信息面板，title 和 aria-label 也要写成“媒体信息”或“切换媒体信息”，不要保留 `Settings` 这类误导文案。

## 空状态不要再额外加一层纵向空隙
- 面板 header 和空状态正文之间不要再补一个额外 `gap`，否则空状态会像被硬生生拉开，视觉上更像坏掉的壳。
- 空状态应该直接填满剩余高度并居中提示文案，让“这里没有内容”看起来是明确的设计状态，而不是布局失控。

## VTT 转 SRT 要按 cue 解析
- 不能直接靠字符串替换把 `.` 改成 `,`，也不能假设每个字幕块都长得完全一样；VTT 里可能有 cue id、时间戳设置和多行文本。
- 最稳妥的做法是先把 VTT 按 cue 解析成统一的时间段结构，再复用同一个 SRT writer 输出，这样格式迁移更稳。

## 字幕文件兼容边界要先兜住
- 解析 VTT 时要先去掉 UTF-8 BOM，不然真实文件里一旦带了 BOM，第一行 `WEBVTT` 就可能识别失败。
- 写 SRT 时如果没有任何 cue，应该返回空字符串，不要输出只有换行的“假内容”，否则后续保存和比较都会很别扭。
- 解析 VTT 时要跳过 `NOTE / STYLE / REGION` 这类元数据块，不能把它们当成字幕正文。
- 字幕转换时不要把 cue 里的多行文本全压成一行，应该保留换行结构，不然双语字幕和分行强调都会被破坏。
- 转换时要剥掉 `<v Speaker>` 这类 voice tag，但别把普通的字幕内容标记一起误删掉。
- 转换时还要清理常见的 `i / b / u / c` 内联标签，避免把 VTT 专属格式直接带进 SRT。
- 字幕里如果有 `ruby / rt / rp` 注音，转换成 SRT 时要去掉注音，只保留正文，不然会出现重复念法。
- 转换时要解码常见 HTML 实体，尤其是 `&amp; / &lt; / &gt; / &nbsp;`，否则导出的 SRT 会保留编码字符。
- 常见排版实体如省略号、长破折号、引号也应该解码，不然 SRT 会显得很生硬。
- 遇到非法数值实体时要回退原样，而不是直接抛错终止整次转换。
- 生成 VTT 时普通文本要先做 `& / < / >` 转义，不然导出的 VTT 可能不是合法格式。

## Grid 列表空状态要单独拉伸
- 列表容器如果用了 `display: grid` 和 `align-content: start` 来保证有内容时从顶部排列，空状态作为唯一 grid item 时很容易只剩文案高度。
- 不要只依赖空状态自己的 `min-height: 100%`，在 grid 场景里它可能不会按预期填满父容器。
- 更稳妥的方式是给空列表加明确状态类，例如 `playlist is-empty`，只在空态把 `align-content` 改成 `stretch`，再让 `panel-empty` 用 `height: 100%` 填满内容区。
- 做这类视觉修复时要量真实 DOM 高度：父面板、内容区、列表容器、空状态四个层级都要看，否则容易误判是外层侧栏塌了。

## 应用图标不要过度设计
- Dock / launcher 图标的首要目标是小尺寸识别度，不是做一张完整的海报式视觉稿。
- 如果用户已经给了清晰截图参考，就应该优先贴近参考里的轮廓、留白和色调，不要额外加厚重外框、复杂光效或多层装饰把主体淹没。
- 图标一旦在 16px / 32px 下发虚、发花或者轮廓过重，就说明设计方向偏了，应该先做减法再谈质感。

## 配置和运行要分层
- 像 whisper.cpp 引擎检测、手动选择这类配置动作，应该放进设置中心；ASR 工作区只保留状态查看、模型下载和字幕生成这类运行态操作。
- 如果同一类动作同时出现在设置页和工作区，用户会很难判断哪个才是长期配置入口，后面扩展更多偏好时也容易继续堆重复入口。

## 设置项变多要提前给导航
- 当设置弹窗里已经出现启动、播放和 ASR 三类偏好时，就应该补一个分组导航，而不是继续把所有卡片从上往下堆。
- 轻量的顶部分组条就足够，不一定要立刻做成侧栏；关键是让用户能快速跳转，避免未来再增加偏好后弹窗变成一条长卷轴。

## 从哪儿打开设置就默认落哪儿
- 如果用户是从 ASR 工作区点进设置，就应该优先打开 ASR 分组；这种上下文默认值能减少一次额外点击，比“永远从第一项开始”更顺手。
- 默认分组不需要复杂记忆，跟着当前工作区走就够了，先把最常见的入口对齐，再考虑做持久化记忆。

## 设置默认分组要真的滚到位
- 只把设置页的 active tab 切到目标分组还不够，滚动容器本身也要一起定位过去，不然用户会看到“标签对了，但内容还在顶部”的错位感。
- 这种默认定位最好在设置弹层刚挂载时完成，避免先显示顶部再跳转，减少闪一下的视觉噪音。

## 设置分组记忆要轻量持久化
- 上次停留在哪个设置分组是一个很适合写回本地的小偏好，比每次重新点一遍更顺手，而且实现成本很低。
- 这类记忆不需要单独做复杂状态机，只要在用户切换分组时同步写回设置文件，再让弹窗初始化时读取即可。

## 设置导航高亮要跟滚动同源
- 顶部 tab 的 active 状态最好直接来自滚动位置，而不是只靠点击事件，不然用户手动上下滑动时会看到“内容变了，导航没变”的错位感。
- 滚动联动和点击跳转最好共用同一套 section 选择逻辑，这样记忆、视觉高亮和配置持久化才会始终一致。

## 设置项 DOM 结构不要每处手写
- `settings-field` 和 `settings-field-copy` 这类字段骨架不要在每个设置项里重复展开，否则新增项很容易漏掉说明容器、调换顺序或写出不一致结构。
- 更稳妥的方式是统一通过 `SettingsField` 组件输出“说明在前、控件在后”的固定结构，具体设置项只传 `title`、`description` 和控件 children。
- 源码约束测试要卡住 `className="settings-field"` 的出现次数，确保新增设置项继续走共享组件，而不是又回到局部手写。

## 设置页基础表单控件也不要散写
- 下拉框和数字输入如果在每个设置项里直接写 `settings-select` / `settings-number`，后续新增项很容易漏掉 class、数字解析、compact 变体或 aria 文案。
- 这类基础控件应该统一通过 `SettingsSelect` / `SettingsNumberInput` 渲染，让 option 输出、数字合法性判断、compact class 拼接都集中在一个地方。
- 源码约束测试要同时卡住 `settings-select` 和 `settings-number` 的出现方式，避免控件外壳统一了，内部控件又开始各写各的。

## 设置页 section 写回不要各自起炉灶
- `ui / media / playback / asr / capture` 这种分组写回如果每个都单独封一套 helper，代码看起来只是整齐了一点，实际上只是把同一种 partial spread 复制了五遍。
- 应该先收口成一个 `createAppSettingsSectionPatcher` 绑定器，再让各个调用点只传 section key 和 patch 内容；实际的对象合并逻辑放到 shared 的 `updateAppSettingsSection`，它既能吃 partial patch，也能吃 updater callback，适合浅层和深层更新一起收口。
- `SettingsDialog` 既然已经只做 section 级写回，就应该直接接收 `AppSettingsSectionPatcher`，不要把整份 settings updater 继续往下传再在组件内部转一层。
- 这类共享 section patch 的参数类型也应该用 `AppSettingsSectionUpdate` 统一命名，避免每个调用点再重复声明一遍同样的联合类型。

## 设置分组必须统一使用 active 状态隐藏
- 设置页原有分组全部渲染后依靠 `is-hidden` 和 `aria-hidden` 切换；新增分组不能只实现内容而遗漏这层状态，否则会在所有设置分组下面串出重复面板。
- 新增设置分组必须同时验证默认分组、其他普通分组和自身激活时的 `display` / `aria-hidden`，并在 smoke 测试中覆盖切换路径。

## 共享组件不能依赖宿主容器的局部 CSS 变量
- `.settings-secondary-button` 会被设置页、AI 弹窗和局域网 Web 弹窗共同使用；如果它依赖只定义在 `.settings-dialog` 内的变量，脱离设置页后高度、内边距和圆角会整体失效，按钮看起来像浏览器默认样式。
- 跨容器复用的基础组件应提供安全 fallback，或者在每个宿主容器显式定义变量；至少要覆盖一个非原宿主弹窗的真实 DOM / smoke 样式回归。
- `SettingsDialog` 的 props 边界也应该直接叫 `patchSettingsSection`，不要再保留一个语义更虚的 `onChange` 再去兜转 section patcher，边界越短越不容易回退。
- section patcher 本身也值得有 `AppSettingsSectionPatcher` 这种共享命名，调用方一看就知道这是正式工具而不是临时闭包。
- 需要改 section 字段时，优先检查通用 helper 的类型约束和源码测试，不要再为单个分组新开一套 `patchXxxSettings`。

## 播放记忆不要在三个入口各写一套
- 音量、静音和倍速是同一组播放记忆，应该统一通过 `syncPlaybackMemory` 这种语义入口更新，不要在静音按钮、音量滑条和倍速选择器里分别散写 `lastVolume / lastMuted / lastPlaybackRate`。
- 这类共享更新最好把“业务语义”放在函数名里，而不是让每个调用点自己拼字段，后面改记忆规则时才不会漏掉某个入口。

## 截图导出偏好不要直接散写
- `clipExportLengthSeconds` 和 `clipExportMode` 是同一个导出偏好组，应该统一通过 `syncClipExportPreferences` 这种业务入口更新，不要让导出对话框直接自己 patch capture section。
- 这种入口名最好直接说出业务对象，后续调整导出默认值或确认流程时，能一眼定位到真正需要改的地方。

## 主进程 settings 清洗不要堆成一坨
- `readAppSettings` / `writeAppSettings` 这类入口最后还是要落到 section 级 sanitizer 上，ui / media / capture / playback / asr 分开后，未来加字段时更容易看出该去哪个分组补校验。
- 播放进度这种带列表结构的字段最好单独抽 `sanitizePlaybackProgressByPath`，不要把过滤、截断、路径检查和 section 组装全压在一个大对象里。
- 旧版 `startup / playback / asr` 这类 section id 要显式映射到当前 `general / interface / subtitles` 语义，不要把老值直接当成合法新值放过去，否则读取历史配置时会把设置页定位到错误分组。

## 设置页开关项也不要散写
- 卡片式开关项如果每处都手写 `setting-toggle`、checkbox、标题和说明，后续新增开关时很容易漏说明、调换顺序，或者把 `event.currentTarget.checked` 写回到错误字段。
- 应该统一通过 `SettingsToggle` 渲染，把 checkbox 事件转换、标题/说明结构和卡片式开关 DOM 固定下来，业务代码只负责传 `checked` 和写回布尔值。
- 源码约束测试要卡住 `className="setting-toggle"` 的出现次数，避免开关项外观统一靠人工记忆维持。

## 设置页目录选择行也不要散写
- 目录型设置如果每处都手写路径展示、文件夹按钮和清空按钮，后续新增目录项时很容易漏掉空值占位、图标、禁用态或按钮间距。
- 应该统一通过 `SettingsFolderPicker` 渲染，把 `settings-path-value`、`FolderOpen`、picker 空值防护和可选清空按钮固定下来，调用处只负责选择函数和写回路径。
- 源码约束测试要卡住 `className="settings-path-value"` 的出现次数，确保路径展示只从共享目录组件出来。

## 设置页紧凑开关 + 数值行也不要散写
- 像“自动隐藏控制条延迟”这种 checkbox + 数值 + 单位的组合行，如果每处都手写，很容易把 `settings-checkbox`、`settings-inline-unit` 和 `SettingsNumberInput` 的组合写乱。
- 应该统一通过 `SettingsToggleValueRow` 渲染，把紧凑布局、禁用态和 aria 文案都固定下来，业务代码只传 checked/value 和两个回调。
- 源码约束测试要卡住 `className="settings-checkbox"` 和 `className="settings-inline-unit"` 的出现次数，避免这种组合行继续分叉。

## Modal 要锁住焦点并还原焦点
- 只做 backdrop 和 ESC 关闭还不够，弹窗打开后必须把 Tab 键限制在弹窗内部，不然键盘用户会不小心跳到背景界面。
- 关闭弹窗后还要把焦点还原到打开它的按钮，这样用户在连续操作设置和下载源时不会丢失上下文。

## 播放停止不要只留空壳
- 只在主进程暴露 `stopNativePlayer` 但不接入真实播放状态，结果就是 UI 里看得到一个“停止”按钮，按下去却没有实际效果。
- 停止动作至少要同时处理当前时间、播放状态和进度持久化，不能只返回一条“当前版本未启用”的文案就算完成。

## 停止图标不要用双层方框
- `SquareStop` 这类双层方框图标在播放器里很容易被看成“回”字，不符合用户对“停止”的直觉。
- 停止语义更适合用实心方块，或者至少用更干净的单层方形图标，避免 `CircleStop` / `SquareStop` 这种双层 stop 图标在小尺寸下变成“回字”。

## 停止按钮不要和 transport 挤成一团
- 停止虽然属于播放控制，但它不是最常用的连续导航动作，和上一首 / 播放 / 下一首绑得太紧会让按钮语义变糊。
- 更稳妥的做法是把 stop 拆成独立按钮，视觉上比 transport 稍轻一点，用户会更容易把它读成“额外的重置动作”。

## 停止按钮不要只靠图标猜语义
- 单独一个方块图标虽然能暗示停止，但在播放器底栏里还是容易和其他方形语义混掉。
- 最稳的做法是给 stop 补上文案，让图标负责辅助识别，文案负责把动作说清楚。
- 如果按钮实际上会回到开头，`title` / `aria-label` 也要写完整，不要只留一个模糊的“停止”。
- 桌面可以讲清楚动作，窄屏要优先保留节奏，长文案按钮应该能收缩成图标态，不要把控制条撑散。
- 这种 reset 型动作适合用轻微 danger tint 提示语义，但别把它做成全红警告按钮，容易抢掉主播放键的注意力。
- 快捷键不要只藏在键盘处理里，按钮本身最好带上 `aria-keyshortcuts` 或 tooltip 提示，鼠标用户也需要知道。
- 窄屏布局不要右边缘对齐所有次级操作，播放器更适合居中堆叠，不然看起来像把系统设置塞进了播放栏。
- 音量区不要为了“看起来完整”无限拉宽，播放器底栏里它应该是辅助控制，不是视觉主角。
- 倍速下拉不要裸露成原生表单块，最好收进速度胶囊里，和音量/全屏一起形成统一的控制语言。
- 控制按钮最好有轻微按压反馈，但要在 `prefers-reduced-motion` 下收掉，别把真实手感做成眩晕动画。

## 空状态控制不要假装可用
- 没有加载媒体时，播放、停止、音量、倍速和时间轴如果还直接露出来，只会制造“按钮坏了”的错觉。
- 更好的做法是直接隐藏播放控制栏，只保留打开入口，让空状态更干净也更像一个成品播放器。

## 空状态不要两栏各自数学居中
- 左侧是大画布、右侧是带表头的侧栏时，如果两个空态都只做数学居中，底部留白会看起来像两套系统，整页会散。
- 更好的做法是统一视觉重心，让主画面的空态稍微偏下，去贴合右侧栏的顶部 chrome 和内容起点，整页收口会更稳。

## 标题栏下方也要留呼吸
- 只把内容卡片做圆角和阴影还不够，标题栏下面如果贴得太死，整页会像少了一层外边距。
- 主舞台和侧栏最好同步增加顶部内边距，让窗口 chrome 和内容区之间有一个稳定的缓冲带，视觉会更从容。

## 左上角 logo 不要贴 mac 按钮
- macOS 窗口左上角的 traffic lights 和品牌 logo 不属于同一组，不能默认只按“能放下”来排。
- 这块需要额外留出一点水平呼吸感，不然 logo 会显得像直接贴在系统按钮旁边，第一眼就不高级。

## 标题栏要按视觉中心微调
- traffic lights 和品牌区看的是视觉中心，不是数学中心；单纯 `align-items: center` 只能保证几何居中，不能保证看起来顺。
- 品牌区如果略高，优先做 1-2px 的整体下移，而不是去改系统按钮的位置，这样更稳也更接近 macOS 的自然感。

## 空状态快捷键也要跟着收口
- 没有媒体文件时，Space / 方向键 / M / S / F 如果还拦截键盘，只会让空状态像是“键盘坏了”。
- 空状态里只保留打开入口和侧栏切换这类真正有意义的操作，其余播放快捷键应该直接退出处理链路。

## 播放快捷键监听不能闭包旧状态
- React 里的全局 `keydown` effect 如果只依赖设置项和弹窗状态，却不依赖当前媒体路径，首次挂载时会把 `currentFile = null` 永久捕获；视频加载后按 Space 看起来像“不支持”，实际是监听器调用了旧闭包。
- 播放器快捷键依赖当前文件、播放状态、音量、倍速和播放列表时，要把这些变化纳入 effect 依赖，或使用明确的最新状态 ref；同时对 Space 的重复触发和按钮原生键盘行为做保护。

## 设置页不要把所有长分组同时铺开
- 设置项变多以后，顶部 tab 再配合下面所有卡片长滚动，会出现“导航和内容同时占空间、卡片高度差巨大、用户不知道当前在哪个分组”的混乱感。
- 更稳妥的结构是左侧固定分组导航、右侧只渲染当前分组；分组内部再用两列排列字段，窄窗口降为单列。这样既减少滚动距离，也让每次进入设置时的视觉焦点明确。

## 控制按钮需要明确的 focus ring
- 播放器控制栏如果只照顾 hover，不照顾 `Tab` 焦点，键盘用户会很难判断自己停在哪里。
- 对这种高频按钮，`focus-visible` 的环形高亮应该和 hover 同样认真做，不然看起来“高级”但用起来还是飘。

## 辅助操作不要散放
- 播放器底栏里的倍速和全屏如果还是单独漂着，右侧就会显得缺乏结构感。
- 把它们收进独立的辅助操作 pill，和左侧 transport / volume 分组呼应，底栏会更像一个完成度高的播放器。

## 播放器全屏要针对视频元素
- 播放器里的“全屏”是视频画面全屏，不是 Electron 的 `BrowserWindow.setFullScreen()`；后者会把标题栏、播放列表和整个软件窗口一起铺满屏幕，语义和播放器按钮不一致。
- 也不能对 `document.documentElement` 调用全屏，否则会把页面上的播放列表、字幕控制和底部控制栏一起带进去。应该让当前 `<video>` 调用 `requestFullscreen()`，再监听 `fullscreenchange` 同步按钮图标和退出提示。

## 全屏图标要表达“下一步动作”，快捷键不要挤占控制栏
- 非全屏状态下要使用明确表示“进入全屏”的 `Fullscreen` 图标，全屏状态再切换到 `Minimize2`；不能只凭 `Maximize2` 的名字判断视觉语义，必须结合实际路径和截图确认用户能看懂。
- 播放器底栏已经通过按钮的 `title`、`aria-keyshortcuts` 和快捷键设置页提供快捷键说明，快捷字幕按钮不应再内嵌一块长 `kbd` 胶囊，否则会压缩状态标题和说明，造成文字截断。

## 窄屏不要依赖 wrap
- 播放器底栏在小屏幕上如果只是 `wrap`，几个 pill 很容易散成“碰运气”的排列。
- 更稳妥的做法是直接切成纵向分组，让 transport、volume 和辅助操作各占一行，结构会更干净。

## 时间轴也要有边界
- 时间轴如果只有两个数字和一个裸滑杆，视觉上会像临时拼接的表单控件。
- 把时间轴行收成状态条，可以让当前时间、总时长和拖动区形成一个完整整体，和下面的胶囊按钮一致。

## 播放控制行别左右对冲
- 如果底栏一行里左边是主操作，右边是次操作，整体容易像两个工具组在互相抢位置。
- 把播放控制行居中成组后，整条底栏会更像一个播放器控制带，而不是左右两块分离的面板。

## smoke 先 build 再看
- `smoke:open-video` 这类脚本读的是 `out/` 构建产物，不先 `npm run build` 的话，很容易误判成“源码没生效”。
- 改完播放器 UI 后，先 build 再 smoke，确认看的就是最新渲染结果，别拿旧 bundle 的截图当真相。

## Electron smoke 要隔离 userData
- 在 macOS 上只设置 `HOME` 不一定能隔离 Electron 的 `app.getPath('userData')`；smoke 可能把测试设置和字幕缓存写进真实的应用目录。
- Electron smoke 应显式传入独立的 `--user-data-dir`，涉及缓存的测试再配合 `AIVPLAYER_ASR_CACHE_DIR` 指向临时目录，并在结束时清理临时目录。
- 运行测试后要检查宿主机配置和缓存目录是否仍有 mock 地址、模型或测试文件，避免“测试通过但污染用户环境”。
- 使用自定义 `--user-data-dir` 启动 Electron 时，参数里仍必须保留 `out/main/index.js` 和媒体路径；少了主进程入口时 Playwright 会一直等不到窗口。
- 等待侧栏内元素前要先点击对应的 panel tab；默认启动在播放列表时，ASR 字幕状态虽然已经恢复，相关 DOM 仍不会挂载。

## 窄屏 flex 不能带着桌面脑子
- 桌面端的 `flex-basis` / `flex` 写法，到了纵向堆叠的窄屏里可能会直接变成高度占位。
- `volume-group` 这类桌面端宽卡片，在 mobile media query 里必须显式 `flex: none`，不然会把控制条撑成一大块空白。
- 窄屏里 stop 不要独占一整行，应该和 transport 同行，不然倍速那组很容易被挤到视口外面。

## 原文和译文缓存的目录规则必须同时考虑升级兼容

- 原文和译文放在不同目录虽然便于实现，但用户点击“打开字幕文件夹”时只能看到英文原文，容易误判翻译失败。
- 改成同目录时，文件名必须显式区分 `-raw` 和 `-translated`，否则不同语言或不同翻译模型可能覆盖彼此的结果。
- 原文路径改名会改变翻译缓存哈希；迁移逻辑不能只改目录，还要用旧原文路径重新计算旧译文缓存，否则升级后已有译文会被误判为未生成。
- 旧缓存迁移优先复制并保留旧文件，命中新文件后再使用新路径，避免升级过程中断导致字幕数据丢失。
- 字幕工具菜单要同时提供原文和译文文件操作入口，不能只改变落盘路径而继续让“打开 SRT”指向用户无法辨认的那一份。

## 播放器视频布局要保留原始纵横比

- 竖屏视频不能只依赖视频元素的 `width: 100%` / `height: 100%` 和 `object-fit: contain`。在 Electron 的实际渲染路径里，视频元素本身可能先被拉成横屏框尺寸，导致画面出现裁剪；播放器应让 `<video>` 自身使用 `width: auto` / `height: auto`，通过 `max-width` / `max-height` 限制在舞台内并居中，同时在元数据加载后把真实宽高写入 `aspect-ratio`。回归时要用真实 `720×1280` 文件检查视频元素尺寸和截图，而不是只看 CSS 源码或横屏样例。

## React 事件对象不能在异步 state updater 里读取 currentTarget

- `<video>` 的 `onVolumeChange` 如果把 `event.currentTarget.volume` 直接写进 `setState(current => ...)`，React 可能在稍后执行 updater；这时 `currentTarget` 已变成 `null`，导致 renderer 抛异常并表现为窗口黑屏。
- DOM 事件数据要在 handler 同步阶段先解构成普通值，再传入 state updater；视频加载、右键打开和手动打开都要覆盖一次这个路径。

## 视频区域的单击和双击手势必须分开处理

- `<video>` 同时监听单击和双击时，不能在 `click` 里立即切换播放状态，否则一次双击会先触发一次播放 / 暂停，再触发全屏，用户会感觉双击误改了播放状态。应给单击留出很短的判定窗口，双击到来时取消待执行的单击动作；全屏必须继续作用于当前 `<video>`，`Esc` 则通过 `fullscreenchange` 同步退出状态。新旧设置升级时还要保证默认开启这组符合常用播放器习惯的手势。
- 全屏 `<video>` 还可能带有 Chromium 的媒体默认点击行为；如果自定义 `click` / `dblclick` 不调用 `preventDefault()`，单击可能先执行自定义暂停，随后又被浏览器默认动作重新播放。全屏视频的播放控制应只保留自定义事件路径，并忽略双击序列中 `detail > 1` 的第二个 `click`。

## macOS 的 ffmpeg 不能直接复制 Homebrew 动态链接二进制

- `/opt/homebrew/bin/ffmpeg` 只是一个依赖 Homebrew Cellar 和多个 `/opt/homebrew/opt/*` 动态库的开发机二进制。直接复制到 `resources/ffmpeg` 后，二进制仍会把旧版本 Cellar 绝对路径写进 `LC_LOAD_DYLIB`；Homebrew 升级后，播放器就会在真正执行时以 `SIGABRT` 报 `dyld: Library not loaded`。
- runtime resolver 不能只判断 ffmpeg 文件路径存在就认为组件可用；必须在 staging / CI 阶段用 `otool -L` 检查外部依赖，并实际执行 `ffmpeg -version` 和 `ffprobe -version`。正式资源应使用静态构建，或把完整 dylib 依赖复制到资源目录并改成 `@loader_path` 相对依赖，不能依赖用户机器上的 Homebrew 路径。

## macOS 原生菜单不能和 Web 界面各写一套语言

- Electron 的 macOS 菜单属于主进程原生 UI；即使 React 播放器和设置页已经支持多语言，`Menu.buildFromTemplate` 里写死的英文仍会直接显示在系统状态栏。
- 菜单文案应和主进程读取到的 `AppSettings.ui.locale` 共用同一份 i18n 词条，并在 `APP_SET_SETTINGS` 完成后重新 `Menu.setApplicationMenu`，否则用户切换语言后只能重启应用才能看到变化。
- 菜单里的应用级动作（打开媒体、设置）要通过主进程现有工作流或受控 IPC 触发，不能复制一套文件选择和设置状态逻辑，否则菜单入口与窗口按钮很容易行为不一致。

## Linux / Windows 无边框窗口不能假设有 macOS 应用菜单

- macOS 的“关于 AIVPlayer”来自系统应用菜单；Linux / Windows 的无边框自绘窗口不会自动获得同样的应用菜单入口，`app.setAboutPanelOptions()` 也只是配置面板内容，不会创建可见菜单项。
- 跨平台产品信息应在应用自己的顶部工具栏提供入口，并复用统一的关于弹窗、版本 IPC 和多语言文案；macOS 可以继续保留原生菜单，避免把平台差异误判成安装包故障。

## 仅处理 process.argv 不能覆盖系统的“打开方式”

- macOS Finder 通过 `open-file` 事件把文件交给已运行的 Electron 应用，Windows 和 Linux 则通常通过命令行参数以及 Electron 的 `second-instance` 事件传递；只在窗口创建时读取一次 `process.argv` 会漏掉后续双击打开的视频。
- 安装包必须声明 `fileAssociations`，否则系统的“打开方式”不会把 AIVPlayer 注册为视频查看器；声明后仍要在主进程处理首个启动参数、macOS `open-file` 和跨平台二次启动转发。
- 文件路径过滤应集中成共享清单，并统一做扩展名大小写、选项参数、文件存在性和重复路径处理，避免安装包支持的格式与运行时支持的格式不一致。

## macOS open-file 事件不能只依赖一次 renderer 广播

- Finder“打开方式”启动或唤醒应用时，`open-file` 事件可能刚好发生在窗口 `did-finish-load` 之后、renderer 注册 `onMediaFilesOpened` 之前；如果主进程只广播一次而不把文件记入可回读状态，视频就会以空舞台或黑屏表现。
- 主进程发送文件事件前要把接收到的媒体合并进初始媒体快照，按路径去重；这样 renderer 即使错过一次广播，也能通过 `getInitialMediaFiles()` 补回，同时不会因为事件和 IPC 回读都命中而重复播放列表。
- renderer 的媒体事件监听必须先于 `getInitialMediaFiles()` 注册；否则即使主进程已经正确转发，首启动时仍可能在 IPC 回读和广播之间丢掉文件。

## 快速字幕配置和快捷键必须保持可见且安全

- 快速字幕不能只依赖源码里的默认配置；翻译接口、模型和 API Key 必须写入用户级配置，API Key 通过 Electron `safeStorage` 加密，不能提交到 Git 或写死在代码里。
- `Ctrl + C` 是系统复制快捷键，快速生成中文字幕应使用 `⌘/Ctrl + Shift + C`；按钮、提示、`aria-keyshortcuts` 和快捷键设置页必须显示同一套完整文案，不能用容易误读的缩写。
- 外部恢复用户级配置后，运行中的 main / renderer 进程可能仍保留旧配置；恢复完成后要明确提示用户重启应用，或提供重新加载配置的机制。

## 一键入口必须是一键完成完整链路

- 用户说“一键 ASR、翻译、摘要”是一个入口具备三个阶段能力，不是把播放器底部拆成三个按钮；看到多个按钮会改变原本的操作预期。
- 快捷入口应直接复用已有的 `complete` AI 工作流，一次点击依次完成 ASR、目标语言字幕翻译和 AI 内容总结，并继续共用缓存、进度、取消和失败重试逻辑，不能复制或拆散流程。

## 播放器反馈不能覆盖视频内容

- 快速字幕入口的完成态、进行态和快捷键提示属于播放器状态反馈，不能使用视频画面内的浮层承载；字幕、人物和画面关键区域会被遮挡。
- 这类常驻操作应放在视频下方的控制栏中，与时间轴和播放按钮形成同一层级；移动到控制栏后要同步检查桌面端、窄屏端和控制栏自动隐藏状态。

## 控制栏三列布局会制造空白并压缩快捷入口

- 播放控制和快捷字幕入口不能用“左侧 1fr / 中间 auto / 右侧 1fr”的三列网格承载；中间控制组较窄时，左侧会出现无意义的大块空白，右侧入口则会被限制在固定列宽内。
- 快捷入口同时包含图标、状态标题、说明和快捷键时，应与播放控制放在同一个可换行的 flex 组合中，并给按钮更合理的最大宽度；文字要允许自然换行，不能依赖 ellipsis 把关键状态截断。
- 修改控制栏布局后要同时验证宽桌面、带右侧面板的中等宽度和窄屏响应式规则，避免只修复截图尺寸却让其他窗口宽度溢出。

## 文件拆分必须以语法边界为准

- CSS 不能简单按累计行数切割；第一次机械拆分把 selector 的逗号列表切在两个文件之间，PostCSS 最终报 `Unknown word`。拆分器必须按完整 brace block 工作，超长 `@media` 再按内部完整规则拆成多个同条件 wrapper。
- 多语言对象不能只按字符串出现位置提取；嵌套的 `languageOptions` 等字段可能误命中。应定位顶层 locale key，拆分后立即跑 TypeScript 和生产构建。
- 大型 React 页面不能把整个函数原样搬到另一个同样巨大的文件；应同时拆状态模型、动作 Hook、副作用 Hook 和 UI 区块，并用上下文或窄 props 连接它们，否则只是换文件名，没有降低维护成本。

## IPC 拆分后必须检查通道唯一注册

- 将主进程入口拆分为多个 IPC 注册模块时，不能只检查新模块是否注册了通道，还要核对原有设置模块是否仍保留同一通道。`ipcMain.handle` 不允许重复注册，重复的 `batch-subtitle:scan-directory` 会在应用启动阶段直接导致未处理 Promise 异常。
- 以后拆分 IPC 前后应对 `IPC_CHANNELS` 做唯一性扫描，并至少执行一次真实 Electron 启动检查，不能只依赖 TypeScript、单元测试和生产构建。

## 固定宽度侧栏不能使用四列文字导航

- 右侧面板固定为 280px 时，四列标签每列只有约 64px；图标、间距和多语言文字会互相挤压，最终导致所有标签只显示省略号。
- 侧栏标签应根据最小可用宽度选择两列两行布局，并保留完整文本和辅助提示；不能只依赖 `text-overflow: ellipsis` 掩盖布局不足。

## 开始工作前必须先读 FEATURE.md 和 FailureExperience.md

- 不能一上来就直接改代码，必须先读这两个文件了解项目上下文。
- FEATURE.md 记录了所有已实现的功能，避免重复实现或遗漏记录。
- FailureExperience.md 记录了历史错误经验，避免重蹈覆辙。
- 每次新增功能要加到 FEATURE.md，每次犯错被指正要加到 FailureExperience.md。
- 这个规则是为了保证换一个 AI 时可以从 0 到 1 重新创建项目。

## Electron 跨平台窗口配置要注意平台差异

- `titleBarStyle: 'hiddenInset'` 是 macOS 专用选项，在 Linux/Windows 上会导致窗口无法正常调整大小。
- 跨平台 Electron 应用应该用 `process.platform === 'darwin'` 判断平台，分别配置窗口选项。
- macOS 可用 `hiddenInset` + `trafficLightPosition`；Linux/Windows 如果接受系统控件外观可用 `titleBarStyle: 'hidden'` + `titleBarOverlay: true`，如果要求按钮完全融入应用主题则改用 `frame: false` + 自绘控件。
- 修改窗口配置后要在所有目标平台测试调整大小、最大化、最小化等功能。

## Linux 原生 titleBarOverlay 不能保证视觉融入

- Electron 的 `titleBarOverlay` 只能设置窗口控件区域的基础颜色和图标颜色，Linux 不同窗口管理器仍可能给最小化、最大化、关闭按钮绘制独立背景。
- 如果产品要求窗口按钮与网页顶栏完全统一，应像 VS Code 一样使用 `frame: false`，把窗口控件放进页面并通过受控 IPC 调用 `BrowserWindow` 的最小化、最大化 / 还原和关闭。
- 自绘控件必须明确设置 `-webkit-app-region: no-drag`，否则拖拽区会吞掉按钮点击；macOS 仍应保留原生 traffic lights，不要跨平台复用 Linux/Windows 控件。

## 首次引导不能把“已配置”和“本次测试成功”混为一谈

- 接口地址、模型名称和 API Key 已经持久化后，应用重启时测试结果状态可能会重新变为空；它不能因此阻止用户继续翻译，否则每次启动都会重复弹出引导窗口。
- 正确做法是把“配置是否完整”作为继续操作的硬条件，把“连接测试是否成功”作为可见的状态反馈和排错入口。配置存在时显示“已配置”，服务真正调用失败时再展示错误。

## 引导弹窗中的操作按钮必须覆盖原生样式

- 首次引导可能在设置面板样式尚未建立上下文时出现，不能只依赖通用按钮类；弹窗内的按钮需要明确设置 `appearance`、尺寸、内边距、背景、边框、圆角和 `:focus-visible`，避免不同平台出现文字外包黑框或原生焦点框。

## CSS 文件名不能用连续数字占位

- 用 `part-01.css`、`part-02.css` 这种按拆分顺序命名，会让不同分支新增样式时争抢同一个数字文件；即使 Git 能自动合并，也会让文件名失去模块语义。
- CSS 应按页面职责使用语义化文件名，并由稳定的 `player.css` 保持加载顺序；新增功能应创建自己的描述性样式文件，不得继续新增 `part-数字.css`。

## 归一化向量要区分实际 metric 与推荐 metric

- SigLIP2 输出向量已经做 L2 归一化时，LanceDB 文档推荐使用 `dot`，因为归一化后点积与 cosine similarity 的排序等价，而且 `dot` 省去了重复归一化，更适合性能优化。
- 不能只回答“当前代码配置的是 cosine”就结束；必须同时检查是否创建了 ANN 向量索引，以及索引创建时的 metric。没有向量索引时，`distanceType()` 只影响精确暴力检索；建立向量索引后，查询 metric 必须和建索引时一致。
- 后续视觉库应明确记录：向量归一化方式、查询 metric、向量索引类型、索引 metric 和是否使用 `bypass_vector_index`，避免把 FTS 索引误认为向量索引。

## 不能仅凭“JPEG 追加 MP4”判断厂商 Live Photo 遵循 Google Motion Photo

- Google Motion Photo 需要检查 `GCamera:MotionPhoto`、`GCamera:MotionPhotoPresentationTimestampUs` 和 `GContainer:Directory` 等 XMP 元数据；文件形态相似不代表元数据协议相同。
- 小米样本可能采用 JPEG + 追加 MP4 的容器结构，但仍使用小米自定义的 Live Photo 元数据和时序字段。当前样本没有 Google Motion Photo 的 `GCamera/GContainer` 标记，而是包含小米自定义 `livephotoInfo` 等信息。
- 调研或实现厂商动态照片时，必须先对真实样本做字节边界、EXIF/XMP、MP4 box 和播放兼容性验证，再决定是否复用通用解析器；“可以提取/编辑视频”与“编辑后仍被厂商相册识别为 Live Photo”必须分开验收。
- 修改 JPEG APP1/APPn 内的 XMP 或厂商 MakerNote 文本时，不能直接缩短数字字符串；JPEG 段长度不会自动修复，必须采用等宽替换或同步调整段长度，否则追加的视频边界可能被错误解析。

## Apple HEIC 的 ContentIdentifier 不能单独判定 Live Photo

- Apple 普通 HEIC 也可能带有 `ContentIdentifier`、`LivePhotoVideoIndex`、HDR 辅助图和大量 HEVC tile；这些字段本身不能证明文件包含动态视频。
- 判定 Apple Live Photo 必须同时找到可播放的同名 MOV/MP4 sidecar，或确认 HEIF 容器内存在实际的动态视频序列；只有主图、缩略图、gain map 和 tile grid 时应按静态 HEIC 处理。
- 编辑 HEIC 封面时，不能把原始 HEIC 直接丢给通用 JPEG 渲染链；应先提取 metadata donor，再把新 JPEG 封面编码回 HEIC，并验证 Apple `ContentIdentifier` 仍然存在。
- 运行时不能依赖开发机 Homebrew 的绝对路径或动态库；HEIC 编码器必须可探测、可注入，缺失时应该阻止这次导出并给出明确原因。
- 发布包不能把 `/opt/homebrew/bin/heif-enc` 这类开发机路径当成跨平台运行时；必须将自包含的 libheif 工具和依赖按平台暂存到 `resources/heif`，由 `release:check-heif-runtime` 在打包前执行验证。macOS 使用系统 `sips` 时才可以不携带 libheif。
- 三平台不能直接复用某一个平台的 libheif 二进制；发布工作流必须固定上游版本、在 macOS / Windows / Linux runner 分别构建，并在 electron-builder 前验证目标平台的 `heif-enc` / `heif-convert` 能实际执行。
## 浅色主题不能保留深色主题的硬编码强调色

- 这次把浅色主题调整成 Chrome 风格后，发现只改 `tokens.css` 里的 `--accent` 不够：多个播放器、设置、AI 面板 CSS 仍直接写死 `rgba(232, 193, 109, ...)`，最终会出现浅蓝背景、蓝灰文字和金色控件同时存在的混搭。
- 以后主题切换涉及强调色时，透明边框、选中底、focus ring、提示卡和渐变也必须使用 `--accent-rgb` 等语义 token；深色和浅色只在 token 层提供不同值，不能在组件 CSS 里继续写死某一套主题颜色。

## electron-builder 打包 sharp 时必须解包原生依赖

- `sharp` 的 Linux 版 `.node` 文件和 `libvips-cpp.so` 即使已经被放进 `app.asar`，Linux 动态链接器仍不能从 ASAR 内加载共享库；启动时会报 `ERR_DLOPEN_FAILED` 和 `libvips-cpp.so.*` 缺失。
- 使用 electron-builder 时，必须通过 `asarUnpack` 同时解包 `**/node_modules/sharp/**/*` 和 `**/node_modules/@img/**/*`，不能只确认依赖存在于 `node_modules` 或 `app.asar` 就认为发布包可运行。
- 修改后要检查 `release/linux-unpacked/resources/app.asar.unpacked` 中确实存在 sharp / libvips 文件，并实际启动 Linux 解包应用验证；MESA/DRI 权限提示属于 GPU 环境问题，应与 sharp 主进程加载失败分开排查。

## CMake install 会要求构建所有被安装的示例工具

- libheif 配置打开 `WITH_EXAMPLES=ON` 后，`cmake --install` 可能安装多个示例工具；如果只显式构建其中两个目标，构建阶段可能成功，但安装阶段会因找不到另一个示例文件失败。
- 在固定的 libheif `1.23.1` 中，实际可构建的目标是 `heif-info`、`heif-dec`、`heif-enc`；`heif-convert` 是安装阶段从 `heif-dec` 创建的兼容软链接，不是独立 target。发布脚本应以固定上游版本的 CMake 定义为依据，构建这三个目标，再在安装后探测 `heif-enc` / `heif-convert`。
- libheif 的 Windows 安装脚本虽然声明会从 `heif-dec.exe` 复制出 `heif-convert.exe`，但 GitHub Windows Runner 上不能完全依赖这个 `cmake --install` 行为；安装后必须显式检查并补复制兼容文件，否则 `release:check-heif-runtime` 会在打包前失败。
- Windows vcpkg 的 `x265:x64-windows-static` 库文件名是 `x265-static.lib`，而 libheif 的 `FindX265.cmake` 只查找 `libx265` / `x265`；不能只安装 vcpkg 包就认为 CMake 会自动发现它，必须显式传入 `-DX265_LIBRARY`。另外，封装 CMake 子进程时必须在异常路径输出 stdout/stderr，否则真正的 MSBuild 错误会被吞掉，只剩一个无上下文的 `Command failed`。
- libheif `1.23.1` 的 `heif-enc` 在 Windows 上即使没有找到 TIFF 也会引用 `TiledTiffReader::TiffCloser`，最终在链接阶段报未解析符号；Windows 发布依赖不能只安装 JPEG、x265 和 libde265，还要安装 `tiff:x64-windows-static`，让 `heifio` 把 TIFF 实现一起链接进来。

## electron-builder Linux 安装目录大小写必须和安装脚本一致

- `productName: AIVPlayer` 会让 electron-builder 将 Linux 应用安装到 `/opt/AIVPlayer`；Debian 的 `postinst` / `postrm` 如果硬编码成 `/opt/aivplayer`，脚本可能仍然以成功状态结束，但实际不会设置 `chrome-sandbox` 的 SUID 权限，也不会创建 CLI 符号链接。
- Linux 安装脚本应从同一个应用目录常量派生所有路径，不能依赖肉眼记忆目录大小写；打包验收必须同时检查 `dpkg -L`、`chrome-sandbox` 是否为 `root:root` 且权限为 `4755`、`gtk-launch` 是否能启动，以及 `/var/log` 中是否出现 Electron sandbox FATAL。

## apt-get 安装本地 deb 必须传绝对路径或显式相对路径

- `apt-get install -y release/aivplayer_*.deb` 可能把 `release` 当成软件包名，导致 `E: Unable to locate package release`；CI 中应先用 `realpath` 转成绝对路径，并用 `dpkg-deb -f` 校验包名后再安装。

## React 事件值要在异步状态更新前先取快照

- Web 媒体库排序 / 筛选的 `onChange` 如果把 `event.currentTarget.value` 直接放进 React 状态更新函数，更新函数稍后执行时 `currentTarget` 可能已经是 `null`，导致筛选后页面崩溃。事件处理器应先把 value 保存为局部常量，再交给状态更新；新增表单交互必须用浏览器级回归覆盖一次真实改变。
## 2026-08-05：Electron 内直接 `window.open` 不等于系统默认浏览器

- 现象：局域网 Web 分享弹窗中的“在浏览器中打开”会在 AIVPlayer 内创建由 Electron 管理的子窗口，用户容易误以为已经调用了系统浏览器。
- 原因：渲染进程直接使用 `window.open(url, '_blank')`，没有经过 Electron 主进程的 `shell.openExternal`。
- 经验：桌面端凡是“交给系统默认应用处理”的 URL，都应通过受控 IPC 交给主进程，并在主进程限制协议为 HTTP/HTTPS；不要把 `window.open` 当作系统浏览器 API。
- 处理：新增 `shell:open-external-url` IPC、URL 协议校验和打开中 / 成功 / 失败反馈；复制访问地址继续作为打开失败时的兜底路径。

## 2026-08-06：代理端口必须以发起外部操作前的实时检测为准

- 现象：一次检测只发现 7897 且请求超时，就直接判断 QuickQ 不可用；随后实际检测发现 QuickQ 已切换到 10027，7897 和 10027 均可访问 GitHub、Google 和 Hugging Face。
- 经验：QuickQ 端口可能变化，不能只检查固定的 10020，也不能把某一次检测结果延续到后续发布操作；每次访问外部资源前都应重新执行 `test-proxy.sh`，按脚本输出的当前可用端口配置代理。

## 2026-08-07：协作修改必须落在主仓库可见的工作区

- 现象：修改如果只存在于远离项目的 Codex worktree，主仓库的 Git Graph 看不到，用户容易误以为代码没有修改。
- 经验：默认不使用外部 worktree；需要隔离时统一放到项目内 `.worktrees/`，完成后合并回主分支并清理 worktree，再向用户报告主仓库路径、提交和远端状态。

## 2026-08-07：新增同类表单控件后必须收紧 Smoke 定位器

- 现象：Clip Inbox 新增标签输入后，真实 Electron Smoke 仍使用通用 `.vision-collection-title-input` 定位标题输入，Playwright 严格模式因匹配两个控件而失败。
- 经验：表单控件复用样式类时，Smoke 不能把样式 class 当作唯一语义选择器；应在功能容器内按 aria-label / role / 明确顺序定位，并在新增字段时同步补持久化断言。
- 处理：Smoke 改为在 `.vision-selection-actions` 内定位两个输入，新增 `smoke, regression` 标签持久化校验；真实重启恢复和编辑工程回归再次通过。

## 2026-08-07：Trickplay 缓存必须同时绑定媒体指纹和渲染参数

- 现象：同一视频的不同缩略图宽度或 JPEG 质量如果共用文件名，时间轴预览可能把旧尺寸的图片误当成新请求结果；视频被替换但路径不变时也可能继续显示旧画面。
- 经验：媒体预览缓存的 key 至少要包含路径、文件大小、修改时间、缩略图尺寸和质量；不能只用 basename 或路径。缓存文件写入必须走临时文件再 rename，避免中断时留下半张图片。
- 处理：新增 `trickplay/sources/<fingerprint>/w<width>-q<quality>` 目录、逐帧 JPEG 和 manifest；相同 source / 参数二次请求命中缓存，媒体 stat 或渲染参数变化自动切换 key。真实 Smoke 已验证首次生成、二次 `cacheHit` 和进度条 hover 预览。

## 2026-08-07：播放器控制弹层必须处理层叠上下文和溢出裁剪

- 现象：Playback Segment 菜单在页面上可见，但真实 Electron Smoke 点击“设置起点”时被底部视频层拦截，Playwright 报告目标元素没有收到 pointer event。
- 原因：播放器控制甲板使用了 `overflow: hidden`，且没有建立高于视频层的层叠上下文；弹层的 `z-index` 只在自身局部上下文内生效，不能解决父级裁剪和兄弟层拦截。
- 经验：新增播放器菜单、Popover 或下拉层时，必须同时检查祖先节点的 `overflow`、`position`、`z-index` 和实际命中测试，不能只给弹层本身加 `z-index`。
- 处理：将控制甲板改为 `position: relative; z-index: 30; overflow: visible`，弹层设置独立层级；真实 Segment Smoke 已验证设置起点、终点、保存、重载恢复和删除。

## 2026-08-07：媒体结构分析缓存必须绑定源指纹和分析参数

- 片头、片尾和黑场属于源媒体事实，不能只按路径缓存；同一路径的文件被替换、时长参数变化、黑场阈值变化时，都必须得到新的分析结果。
- 分析结果写入用户目录时应使用源文件大小 / 修改时间和 `blackdetect` 参数生成缓存 key，并采用临时文件后 `rename` 的原子写入方式，避免半成品 JSON 被下一次读取。
- FFmpeg 的 `blackdetect` 输出位于日志流中，解析时要合并 stdout / stderr、限制最短黑场时长并裁剪到已知媒体时长；没有可靠时长时不要凭空推断片尾。
- 结构分析 UI 先提供置信度、源区间和可点击定位，让用户能人工复核；跳过按钮和持久化人工修正继续作为独立能力，不能把启发式检测直接变成强制剪辑。
- FFmpeg `blackdetect` 的 `pix_th` 是单像素亮度阈值，不是“黑色像素占比”；误写成 `0.98` 会把红色等高饱和画面也判成黑场。调整外部滤镜参数后必须用黑场、彩色画面和片尾黑场组成的合成媒体做真实 Smoke。

## 2026-08-07：后台结构分析会先于 Smoke 显式请求写入缓存

- 现象：播放器加载媒体后会自动后台分析；Smoke 随后显式调用默认参数分析时，第一次调用可能已经命中播放器刚写入的缓存，导致“首次必须 `cacheHit=false`”的断言不稳定。
- 经验：真实 Smoke 要区分产品后台预热和测试目标；需要验证冷缓存时，应使用只属于 Smoke 的分析参数，再用同一组参数验证第二次命中，而不是依赖新的用户数据目录就假定没有竞争请求。
- 处理：Smoke 使用 `pixelThreshold=0.11` 的独立参数验证首次分析与二次缓存命中；产品默认播放器分析仍使用默认阈值，二者都复用同一缓存契约。

## 2026-08-07：结构分析人工修正必须按媒体指纹隔离

- 现象：忽略某个片段如果只按 `segmentId` 保存，会在用户替换同一路径的视频后误伤新媒体；如果直接修改视频或分析缓存，又无法恢复原始证据。
- 经验：人工判断属于用户侧覆盖层，不应改写原媒体和自动分析结果；修正记录至少要包含媒体指纹、片段 ID、区间、类型和更新时间，并提供恢复入口。
- 处理：修正写入应用设置的 `structureCorrectionsByFingerprint`，编辑器保留忽略 / 恢复操作，播放器只对未被忽略的黑场区间显示跳过按钮；片头 / 片尾标签仍作为可复核证据展示，不直接强制剪辑。

## 2026-08-07：字幕 QA 必须把双语轨道和同轨重叠分开

- 现象：源字幕和译文通常拥有相同的时间区间；如果按所有字幕全局排序检查重叠，会把正常的双语字幕误报成时间冲突。
- 经验：字幕 QA 的重叠判断必须按 `source` / `translation` 轨道分组，只报告同一轨道内的真实重叠；QA 结果应保持纯函数、可重复和不修改原始字幕。
- 处理：分析器按字幕轨道独立检测，并用媒体 Smoke 验证面板问题数量、点击定位和 renderer error；所有自动判断都先作为可复核证据展示，不直接改写字幕或剪辑工程。

## 2026-08-07：FFmpeg showwavespic 参数必须以本机滤镜能力为准

- 现象：波形初版使用 `showwavespic` 的 `filter=point`，当前 FFmpeg 直接报 `Unable to parse "filter" option value "point"`，导致音频波形没有生成。
- 经验：FFmpeg filter 的参数枚举不能凭其他版本或记忆猜测；接入前要用目标环境的 `ffmpeg -filters` / `ffmpeg -h filter=showwavespic` 或真实命令验证，并保留无音频 / 不支持场景的失败返回。
- 处理：改用当前版本支持的 `filter=peak`，波形 PNG 仍按媒体 stat、尺寸和高度隔离缓存；真实 Smoke 验证冷缓存生成、热缓存命中、时间线渲染和点击定位。

## 2026-08-08：字幕微调必须复用已有可撤销动作

- 现象：视觉同步如果直接改 DOM 的时间块位置，只能暂时改变画面，刷新、重载或下一次工程操作就会丢失，且播放头与字幕工程状态可能分叉。
- 经验：字幕 cue 的微调、当前播放头设为起点 / 终点都必须调用现有 `moveEditingCaption` / `resizeEditingCaption`；这些动作已经负责历史栈、项目保存和选中状态。
- 处理：视觉同步面板只负责把当前 cue 和用户意图转成已有动作，Smoke 同时验证 `+0.1s` 后位置变化与点击撤销后的原位恢复。

## 2026-08-08：OCR / TTS 派生结果必须先过来源指纹校验

- 现象：OCR 或 TTS 任务可能在媒体被替换、任务重试或应用重启后才返回；如果只按任务 ID 接受结果，旧视频的文字或音频可能被挂到新媒体上。
- 经验：任务输入必须绑定媒体路径之外的 source fingerprint 和 input hash；结果晋级前再次检查 fingerprint、有效时间范围和非空文本，OCR 证据与 TTS 音频必须保持不同 artifact 类型。
- 处理：新增纯状态机约束，脏结果直接丢弃；重试次数有上限，取消只改变任务状态，不删除或覆盖原字幕 / 原媒体。

## 2026-08-08：本地 OCR / TTS 适配器不能绑定开发机路径

- 现象：当前开发机能找到 Homebrew 的 `tesseract`、FFmpeg 和 macOS `say`，但这些路径和命令并不等于 Windows / Linux 发布包中的可用运行时；如果直接写进主进程，换机器后会变成启动即失败。
- 经验：本地二进制必须由桌面层或发布运行时探测后显式注入，核心适配器只负责参数安全、临时文件清理和取消传播；TTS 还要保留可替换 provider 边界，不能把 macOS `say` 当成跨平台实现。
- 处理：新增 `local-evidence-adapters`，FFmpeg / Tesseract / TTS 命令均通过参数传入，使用参数数组避免 shell 插值；能力探测独立返回 OCR、TTS 各自状态，单个能力缺失不影响另一个能力。

## 2026-08-08：证据任务 IPC 不能复用全局取消控制器或相信 Renderer 指纹

- 现象：OCR / TTS 任务通过主进程执行，如果所有窗口共用一个 AbortController，一个窗口取消会误杀另一个窗口的任务；如果直接接受 Renderer 传来的指纹，媒体替换后可能继续使用旧证据。
- 经验：长任务的取消控制器必须按 `sender.id` 隔离，并在任务开始前由主进程依据当前文件 `path + size + mtime` 重算 source fingerprint；进度事件也必须回发到原 sender。
- 处理：新增证据任务 IPC 的 sender 级控制器、启动 / 取消 / 能力探测 / 进度通道；请求只携带媒体路径和输入哈希，任务合同中的媒体指纹由主进程生成。

## 2026-08-08：OCR 落库不能重建整张 evidence 表

- 现象：视觉索引已有字幕和视觉证据；如果 OCR 完成后复用全量 `replaceEvidenceRows`，一次 OCR 任务就可能删除旧字幕 / 视觉行，导致检索结果回退或丢失。
- 经验：派生证据必须按稳定 evidence id 做单条 upsert，只删除同一个 id 的旧版本；落库前再次读取媒体 `path + size + mtime` 指纹，任务期间媒体发生变化就跳过写入。
- 处理：新增 `VisionLibrary.upsertEvidence` 和 `persistOcrResult`，并用真实 Electron Smoke 验证 1 条 OCR + 1 条已有 visual 同时存在，stale 媒体不会新增 OCR 行。

## 2026-08-08：长时间证据任务的 UI 必须绑定可验证状态

- 现象：OCR 任务跨越多个 IPC 进度事件；如果面板只在点击时等待一次 Promise，用户看不到排队、进度、取消或 stale / 落库失败结果，Smoke 也无法证明真实 UI 已接上任务链路。
- 经验：任务卡片要订阅并在卸载时移除 sender 进度监听，用稳定的 `data-testid` 和 `data-persistence-status` 暴露可观测状态；按钮禁用条件必须同时考虑媒体、能力探测和任务运行态。
- 处理：新增 OCR 时间范围卡片和四种语言文案，Smoke 从影视库面板启动 OCR、等待 `persisted` 并保存截图；底层 IPC / 落库验证仍保持独立，避免 UI 选择器掩盖数据链路问题。

## 2026-08-08：无 frame_id 的派生证据不能复用视频帧作为搜索主键

- 现象：OCR 证据只绑定时间范围，通常没有 `frame_id`；如果搜索结果继续把空 frame id 当作主键，同一视频的多条 OCR 会互相覆盖，点击结果也无法稳定对应具体证据。
- 经验：字幕 / 视觉证据可以按 frame 合并，但 OCR、场景和实体等派生证据必须按 `evidenceId` 保持身份；结果显示和 Clip Inbox 也要沿用同一个身份规则。
- 处理：新增统一 `getVisionSearchResultKey`，修复证据词法检索和混合检索合并键；真实 Smoke 搜索 `Smoke OCR text`、校验证据 ID，并确认点击后播放头落在 `0.5–1.5s`。

## 2026-08-08：搜索结果定位不能依赖固定延迟

- 现象：媒体切换后，视频元数据加载和 React 状态更新的耗时并不固定；用 `setTimeout(120)` 调 `seekTo` 时，偶发只能落在目标时间附近，无法证明已经定位到正确证据。
- 经验：跨媒体跳转要把目标路径和时间暂存为 pending 状态，等目标视频触发 `loadedmetadata` 后再执行 seek；Smoke 应使用明确的 OCR 起点并断言目标时间误差，而不是只断言视频曾经播放过。
- 处理：VisionPanel 改为元数据就绪后定位；Smoke 固定 OCR 范围为 `0.5–1.5s`，真实结果校验 `currentTime=0.5`，同时保留 renderer error 检查。
