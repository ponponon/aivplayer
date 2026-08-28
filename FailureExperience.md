## 2026-08-27：AI 工作流状态条不能用固定浮层覆盖功能面板

- 现象：AI 工作流运行提示固定显示在窗口右上角，视觉上遮住右侧 ASR / 字幕功能；由于浮层本身接收鼠标事件，被遮住的按钮无法点击。
- 原因：`.ai-workflow-bar` 使用 `position: fixed` 和较高层级脱离主布局定位，只按视口右上角计算位置，没有为播放器和侧面板预留空间。
- 经验：后台状态提示只有在不会挡住主任务时才算非阻塞；需要交互的状态条应进入主布局流，不能仅依赖半透明背景或降低视觉干扰来解决点击穿透问题。
- 处理：在 AppShell 中为 AI 工作流增加独立布局行，移除固定定位并按可用宽度右对齐；播放器和侧面板整体位于状态条下方，移动端继续在同一布局行内自适应换行，并补充源码回归约束。

## 2026-08-27：修复提交后必须核对用户实际运行的构建版本

- 现象：`align-self: stretch` 滚动修复已提交并通过 smoke，用户反馈「偏好设置还是不能下滑」，我最初判断用户在跑旧打包版，后来用户澄清用的是 `npm run dev`，此判断被推翻。
- 原因：dev 模式的 HMR 不是无条件实时——修复发生在会话启动之后时，若窗口的 HMR 连接断过、watcher 漏检或窗口是在修复前打开且未刷新，窗口会一直用旧 CSS；Vite dev 本身按需转换源码，窗口重新加载后必然是新代码。另外我在排查时用 `pkill -f electron-vite` 清理进程，可能连带杀掉了用户正在跑的 dev 会话。
- 经验：收到「bug 还在」的报告时，先问清用户运行的是打包版 / `npm run dev` / `out` 构建，再决定要不要改码，不要臆断构建来源；dev 下验证修复要「重启 dev 或 Cmd+R 刷新窗口」后再看效果；绝不要随手 `pkill` 按进程名匹配的命令清理环境，极易误杀用户会话，要用精确 PID。
- 处理：确认源码与 out 构建修复有效（Playwright 真实滚轮 scrollTop 0→600），无需改码；引导用户重启 dev 后复测，并修正本条最初「用户在跑打包版」的错误结论。

## 2026-08-27：设置弹窗的滚动网格不能只设置 overflow-y

- 现象：字幕设置内容超出弹窗底部，但鼠标滚轮和程序设置 `scrollTop` 都没有效果；用户看到的是被底部裁掉的长内容，无法继续下滑。
- 原因：`.settings-body` 为了让左侧分组导航按自身内容高度排列而使用 `align-items: start`，右侧 `.settings-grid` 因此没有被拉伸到中间可视区域，而是按全部卡片的内容高度展开；外层 `settings-body` 又是 `overflow: hidden`，滚动网格实际没有溢出距离。
- 经验：CSS 滚动容器除了 `overflow-y: auto`，还必须检查它在 Grid / Flex 父级中的实际尺寸；当父级需要保留 `align-items: start` 时，滚动子项要显式 `align-self: stretch`，并用真实滚轮交互验证 `clientHeight < scrollHeight` 且 `scrollTop` 会变化。
- 处理：为 `.settings-grid` 增加 `align-self: stretch`，补充设置页 Smoke 的真实滚轮滚动断言和源码约束，防止后续布局调整再次让滚动区域被内容高度撑开。

## 2026-08-26：未知架构的官网下载按钮不能只重渲染

- 现象：Firefox 154 点击官网推荐下载按钮没有下载，也没有明显界面变化；WebDriver BiDi 记录到按钮地址是 `#download-chooser`，点击后没有产生 DMG 请求。
- 原因：Firefox 不提供 `navigator.userAgentData`，推荐资源因此为空；点击处理器执行 `preventDefault()` 后只重新渲染，没有滚动或聚焦到手动选择区，用户看不到下一步。
- 经验：未知架构必须继续保留人工确认，CTA 不能伪装成“下载 macOS 版”；拦截 hash 导航后必须显式滚动到详情区并把焦点交给第一个可用架构选项。
- 处理：增加“选择平台和架构”文案；推荐按钮点击后展开选择器、平滑滚动到详情区并聚焦第一个可用架构按钮；补充源码契约测试和 Firefox BiDi 回归验证。

## 2026-08-26：发布依赖不能永久依赖已被上游清理的固定构建资产

- 现象：v0.6.6 Release workflow 的 macOS 权限修复尚未进入发布汇总，Windows 和 Linux 多个平台却先后在 FFmpeg 下载步骤失败，`curl` 返回退出码 22。
- 原因：工作流固定的 `autobuild-2026-08-09-13-03` 已不在 FFmpeg-Builds 的公开 Release 列表中，四个 Windows / Linux 下载地址全部返回 HTTP 404；这不是 Runner 网络故障，也不是本次 AIVPlayer 代码改动导致的编译错误。
- 经验：发布依赖的“版本固定”必须同时验证上游 Release、资产名称、HTTP 可达性和 SHA-256；不能只把旧 URL 和哈希写进 workflow，就假设第三方构建资产永久保留。正式发布前应先回读所有外部二进制资产。
- 处理：将 FFmpeg 8.1.2 的 Windows / Linux 资产统一切换到仍存在的 `autobuild-2026-08-25-13-06`，同步更新构建 revision、四个平台 URL 和 SHA-256；已失败且尚未创建 Release 的 v0.6.6 workflow 取消后，从修复后的 main 手动重跑同一个 tag，不覆盖任何已有 Release 资产。

## 2026-08-25：macOS ShipIt 更新失败不是签名失败，而是发布包内 native runtime 只读

- 现象：`/Applications/AIVPlayer.app` 下载 0.6.5 后仍显示 0.6.3；ShipIt 连续重试后放弃安装并重新启动旧版本。
- 原因：下载包 SHA512 校验和 App 签名 / 公证均正常，但 `Contents/Resources/heif/libwebp.7.2.0.dylib` 等 native sidecar 被复制成 `0444`。ShipIt 清理 `com.apple.quarantine` 时需要修改文件属性，因所有者没有写权限返回 `NSPOSIXErrorDomain Code=13`。
- 经验：macOS 更新排查必须按“下载校验 → 签名 / 公证 → ShipIt 安装日志 → 目标文件权限”分层判断；App 能运行只证明可以读取并加载动态库，不能证明 ShipIt 能修改这些文件。不能把沙盒内 `codesign` 的异常输出直接当成真实签名失败。
- 处理：HEIF、FFmpeg 和 whisper.cpp 的复制链路统一规范 native runtime 权限；可执行文件使用 `0755`，动态库和 sidecar 使用 `0644`；`check-packaged-resources` 对 macOS runtime 目录增加 owner-write 门禁，发布前直接阻止只读文件进入安装包。

## 2026-08-25：自动更新检查频率与提醒频率不能绑定

- 现象：自动更新启动后立即检查，随后每 10 分钟检查一次；用户关闭同一版本的更新提示后，下一轮检查又会再次弹出，应用重启后也没有“稍后提醒”的记忆。
- 原因：检查定时器固定为 10 分钟，`dismissAppUpdate` 只把状态改回 `idle`，没有记录版本和关闭时间；因此下一次 `update-available` 会被当成新的提醒。
- 经验：更新检查属于低频后台同步，不应使用接近交互轮询的频率；“是否联网检查”和“是否打扰用户”必须是两套策略，提醒至少要按版本和时间做持久化抑制，同时给手动检查保留明确的即时覆盖入口。
- 处理：首次自动检查延迟 1 分钟，后续改为每 6 小时；同一版本点叉后持久化 24 小时冷却，自动检查期间静默该版本，用户手动检查仍可显示；跳过版本继续永久记录，并兼容原来只有 `skippedVersion` 的偏好文件。

## 2026-08-25：macOS 关闭窗口后再次打开视频不能只依赖 Dock 激活

- 现象：macOS 点红色关闭按钮后应用进程和 Dock 图标仍保留；用户从 Finder 再次打开视频时，系统已经把 `open-file` 事件交给 AIVPlayer，但因为主窗口已关闭，播放器不会自动出现，必须手动点击 Dock。
- 原因：macOS 的 `window-all-closed` 为了保留单实例后台状态不调用 `app.quit()`；原有 `open-file` / `second-instance` 处理只排队媒体路径，`activate` 又只响应 Dock 激活，缺少“外部打开事件到达时重建主窗口”的分支。
- 经验：应用选择“关闭窗口但不退出进程”时，外部文件打开、第二实例和 Dock 激活都必须共享同一个“确保主窗口存在并唤起”的入口；同时必须把已销毁但尚未完成 `closed` 回调清理的窗口视为不存在，冷启动阶段还要保留待处理路径，不能为了修复唤起而提前在 `app.ready` 前创建窗口。
- 处理：新增 `ensureMainWindow` 和统一的存活窗口判断，在主窗口不存在且 Electron 已 ready 时重建并聚焦窗口；`open-file`、`second-instance` 和 Dock `activate` 统一接入，媒体投递在窗口销毁竞态中回到待处理队列，并允许 `did-finish-load` 回调消费待处理路径，避免加载完成事件内再次被 `isLoading()` 卡住；冷启动仍由 ready 初始化流程消费排队路径，旧窗口的 `closed` 回调只清理它自己的引用。

## 2026-08-25：更新偏好、按钮文案和通知层必须与状态机一致

- 现象：更新设置文案承诺会自动下载并安装，但 updater 实际只会定期检查；可用更新的主按钮显示“安装更新”，实际执行的是下载；下载过程中顶部 Banner 和右下角 Dialog 同时显示同一状态。
- 经验：偏好名称和按钮必须描述真实的状态转换；一个状态只保留一个主要通知来源，避免用户面对重复进度和互相遮挡的操作。
- 处理：将偏好改为“自动检查更新”，可用状态按钮改为“立即下载”；右下角通知轨道只承载待确认的可用更新，下载、完成和安装状态统一由顶部更新条展示；自动 AI 工作流和 ASR 结果提示补充 live region 语义。

## 2026-08-25：Snap Store Listing 与 Snap 二进制元数据是两条链路

- 现象：Snap 包内已经有 `meta/gui/*.png` 和 `.desktop`，Ubuntu 桌面入口可以使用图标，但 Snap Store / App Center 列表仍显示灰色占位图；Listing 页面还要求独立的 Category、License、官网、源码和 Issue 字段。
- 原因：Snap 的桌面入口图标与 Store Listing 图标不是同一个字段；electron-builder 生成并发布 Snap 二进制不会自动完成所有 Store Listing 运营资料，`linux.category: AudioVideo` 也不会自动转换为 Snap Store 的 `Photo and Video` 分类。
- 经验：发布验证必须分开检查 Snap 包内容、Snap Store channel-map 和 Store Listing 页面；不能因为 Snap 上传成功就认为商店资料完整。Listing 资料应由独立流程或首次人工配置维护，普通版本发布不应覆盖它。
- 处理：已在 Snap Store Listing 保存图标、`Photo and Video`、MIT、官网、源码、Issue 和 Summary / Description；仓库的发布流程保留这些字段的事实记录，但不把账号登录态、商店凭据或页面操作写入代码。

## 2026-08-25：R2 镜像超限不能阻断 Snap 发布

- 现象：x86_64 Snap 在 Snap Store 发布成功，但发布后的 R2 下载同步因为 `300,052,480` bytes 超过 REST API 的 `300,000,000` bytes 限制而失败；Snap Store 本身并未拒绝该包。
- 原因：Snap Store / GitHub Release 与 R2 REST 镜像有不同的文件大小限制；此前只对从 GitHub 下载的资产做超限判断，正式 workflow 传入本地 assembled 资产时没有走回退分支。
- 经验：发布脚本必须同时检查 GitHub 远端元数据和本地资产大小；R2 无法承载的包应保留 GitHub Release 直链和已验证哈希，不能让单个镜像失败阻断整个 Release。
- 处理：增加本地大文件检测和 GitHub 直链回退，补充 SHA-256 / URL 回退测试；Snap Store 继续作为 Snap 的权威发布渠道，R2 仅作为可选下载镜像。

## 2026-08-24：自动更新提醒不能默认使用全屏模态框

- 现象：版本更新提示使用全屏遮罩和焦点锁定，用户在播放视频或处理素材时被迫中断主任务；更新检查本质上是低频、可稍后处理的后台状态，不符合模态交互的打断级别。
- 经验：只有必须立即确认且不能继续主任务的动作才适合模态框。更新发现、下载进度和重启安装应使用不阻塞主界面的通知层，并保留清晰的主操作、稍后处理和键盘关闭路径。
- 处理：将更新选择面板改为右下角非模态通知，移除全屏遮罩、`aria-modal` 和模态焦点锁定；保留 Escape、关闭按钮、稍后提醒、跳过版本、下载和安装动作，同时对进入动画提供 reduced-motion 回退。

## 2026-08-24：官网 macOS 默认安装包不能依赖清单键顺序
- 现象：官网识别出 Apple 芯片后，点击推荐下载得到 `AIVPlayer-0.6.3-arm64-mac.zip`，用户期待的是可双击安装的 DMG；线上清单其实同时存在 DMG 和 ZIP。
- 原因：官网用 `Object.keys(asset)[0]` 的等价逻辑把多格式对象的第一个键作为默认格式，而发布清单生成时 ZIP 可能先于 DMG，JSON 对象顺序不代表用户体验优先级。
- 经验：安装包格式必须有显式的平台优先级；macOS 默认应优先 DMG，ZIP 作为保留的手动备选，不能把远程 JSON 的对象顺序当作业务规则。
- 处理：官网增加 macOS `dmg > zip` 格式排序，发布脚本也按同一优先级规范多格式清单，并增加输入顺序为 ZIP → DMG 时仍输出 DMG → ZIP 的回归测试。

## 2026-08-24：模型缓存不能只按“文件存在”判断
- 现象：ASR 目录里只要有任意模型，后台准备就可能误判推荐模型已经就绪；Vision 和人物抠像只要文件非空，就可能继续使用旧 revision、截断文件或错误内容。
- 原因：三个下载器各自维护缓存判断和临时文件逻辑，且 Vision 在读取远程 manifest 之前就返回缓存，ASR 启动判断只检查已安装模型数量。
- 经验：模型清单必须先确定版本、文件大小和 SHA-256，再校验本地缓存；下载必须写入唯一临时文件，校验成功后原子替换，失败时清理最终坏文件。多源下载还要区分“用户明确选择源”和“默认自动回退”。
- 处理：抽出通用模型完整性模块，统一 ASR / Vision / 人物抠像下载器；ASR 自动源按 R2、ModelScope、Hugging Face 回退，推荐模型按 id 精确判断；补充损坏缓存、错误 manifest、校验失败和回退测试。
- 复盘发布链路时还发现线上 0.6.3 的旧版 Vision Pack manifest 没有 `revision`，如果客户端只接受新格式，已经发布的用户会在更新后无法下载视觉运行组件；因此下载器保留按版本目录读取旧清单的兼容路径，新发布仍使用 revision 内容寻址。

## 2026-08-24：R2 Multipart 断点状态必须绑定文件内容
- 现象：仅用文件大小和修改时间识别断点状态时，文件被替换但时间戳未变化，脚本可能跳过旧分片，把不同内容拼成一个对象；固定临时状态文件也可能被并发进程互相覆盖。
- 原因：S3 Multipart 的 ETag 不是完整文件 SHA-256，R2 HEAD 默认只能证明对象大小，不能证明内容等于本地源文件。
- 经验：断点状态必须绑定本地 SHA-256；完成后至少校验对象大小和上传时写入的 SHA-256 元数据，状态文件使用进程隔离的临时文件原子替换。
- 处理：Multipart 状态升级到 v2，记录文件 SHA-256，上传时写入 `x-amz-meta-sha256`，恢复 / 完成阶段校验该元数据，并在合并前再次确认本地文件没有变化。

## 2026-08-23：R2 大文件不能继续使用 Wrangler 单文件上传
- 现象：Whisper 模型本地文件大小约 547 MiB，使用 `wrangler r2 object put --remote --file` 上传时在客户端直接失败，提示 Wrangler 只支持不超过 300 MiB 的文件；此前因此误以为模型无法上传到 R2。
- 原因：Wrangler 的 REST 上传路径有 300 MiB 的单文件限制，和 R2 本身支持的大对象能力不是同一个限制；超过该大小的文件应使用 R2 的 S3-compatible Multipart Upload。
- 经验：发布脚本必须按资产大小选择上传通道：普通安装包可继续使用 Cloudflare REST API，模型等大文件要使用 R2 API Token 的 Access Key ID / Secret Access Key，通过 S3 Multipart Upload 分片、重试并在完成后校验远端大小。
- 处理：新增 `scripts/upload-r2-multipart.py`，仅依赖 Python 标准库，保存不包含密钥的断点状态；以后遇到超过 300 MiB 的 R2 资源，复用该脚本，不要修改 Wrangler 限制或把大文件拆成客户端无法识别的多个对象。

## 2026-08-21：Linux hicolor 图标不能只提供 1024×1024
- 现象：Ubuntu 26.04 安装 `.deb` 后，GNOME 应用列表中的 AIVPlayer 显示默认齿轮图标；应用本身的 `.desktop` 文件和图标文件都存在。
- 原因：electron-builder 将单个 1024×1024 PNG 安装到了 `/usr/share/icons/hicolor/1024x1024/apps`，而 Ubuntu 的 hicolor 主题只声明并索引到 512×512，`Icon=aivplayer` 因此无法解析到实际图标。
- 经验：Linux 发布图标必须落在目标发行版 hicolor 主题声明的标准尺寸中；不能只检查 `.desktop` 的 `Icon` 字段或图标文件是否存在，还要检查最终 `.deb` 的安装路径和主题尺寸。
- 处理：保留 1024×1024 品牌源用于应用资源，新增 512×512 Linux 图标并让 electron-builder 使用它；增加 PNG 尺寸回归测试，后续还应在 Linux Runner 的 `.deb` Smoke 中验证 512×512 图标确实进入安装包。

## 2026-08-14：不能用普通 UA 字符串判断真实 CPU 架构
- 现象：Windows ARM 设备点击官网推荐下载后拿到 `AIVPlayer-Setup-0.5.6-x64.exe`，用户实际需要 ARM64 安装包。
- 原因：旧逻辑在 `navigator.userAgentData` 架构字段不可用时，把 `navigator.userAgent` 中的 `x86` / `x64` 文本当成设备架构。浏览器可能运行在 x86 模拟层，普通 UA 只能说明浏览器暴露的兼容信息，不能证明物理 CPU 架构。
- 经验：优先异步请求 UA-CH 高熵 `architecture` 和 `bitness`；不要从普通 UA 推断 ARM。即使 UA-CH 也被浏览器限制、缺失或报告的是模拟层架构，网页没有 API 可以穿透兼容层确认真实 CPU，因此必须保留手动选择，并且不应在架构未知时静默下载某个安装包。
- 处理：下载推荐改为等待 `getHighEntropyValues(['architecture', 'bitness'])`，只在得到明确 ARM / x64 提示时生成直接下载链接；无法确认时按钮改为跳转手动平台 / 架构选择区，并显示原因。

## 2026-08-14：R2 下载清单缺少 CORS 会让按钮误回退到 GitHub
- 现象：官网的“下载推荐版本”按钮看起来正常，但点击后仍然跳转到 GitHub Release 资产，而不是 `releases.quniv.cn` 的 R2 下载地址。
- 原因：页面初始 HTML 为了容错保留了 GitHub href；页面脚本启动后会 fetch R2 的 `download-manifest.json` 并替换 href。R2 自定义域名没有返回 `Access-Control-Allow-Origin` 时，浏览器会拦截这次 fetch，`loadDownloadManifest()` 捕获异常后继续使用内置的 GitHub 回退清单，因此最终按钮仍指向 GitHub。
- 经验：检查 R2 对象是否能被 `curl` 访问不够，必须带真实站点的 `Origin` 请求头验证 CORS 响应，并在浏览器中确认按钮最终 href。R2 CORS 只允许 `GET` / `HEAD` 和官网、本地预览源，不要为了解决读取问题开放写入或删除权限。
- 处理：为 `aivplayer-releases` 配置 `config/r2-cors.json`，通过 Wrangler 应用只读策略；验证 `https://releases.quniv.cn/aivplayer/releases/download-manifest.json` 返回 `access-control-allow-origin: https://aivplayer.pages.dev`，并增加配置回归测试。

## 2026-08-14：影视库卡片右侧操作列不能贴边或溢出
- 现象：影视库素材卡片左侧缩略图和内容正常，但右侧播放图标贴近边界，窄侧栏或滚动容器下看起来像没有右边距，部分宽度下还可能被裁切。
- 原因：来源卡片和网格只声明了 `min-width: 0`，没有把卡片宽度明确限制在滚动容器的可用宽度内；网格列的固定最小宽度和右侧操作列也没有为窄侧栏预留稳定空间。
- 经验：侧栏中的卡片列表必须同时约束列表宽度、网格列最小值和卡片宽度，操作图标列要显式保留内边距；不能只依赖 Grid 默认的 stretch 行为来保证边界。
- 处理：为影视库来源列表和卡片增加 `width/max-width: 100%`，将网格最小列改为不超过容器宽度的自适应值，扩大右侧操作列并保留右内边距，同时让图标在操作列内居中；补充 CSS 源码回归断言。

## 2026-08-14：视觉索引不能因打开视频自动消耗算力

- 现象：播放列表发生变化或保存的影视库目录被扫描后，应用会在后台自动排队视觉索引；打开一个新视频也可能触发 SigLIP2 推理、FFmpeg 抽帧和 LanceDB 写入，用户没有明确发起索引任务却承担了 CPU / GPU 消耗。
- 原因：Renderer 的 `useVisionIndexEffect` 在播放列表或目录变化后延迟 800ms 启动，并每 60 秒重复扫描；“扫描全部文件夹”完成后也直接调用 `enqueueVisionIndex`。
- 经验：视觉索引属于高成本、可选的维护操作，不能和“打开 / 播放 / 扫描发现文件”绑定。扫描只能发现候选文件，索引必须由用户明确点击“批量建立影视库”或收件箱“加入索引队列”触发。
- 处理：移除应用启动时的视觉索引 Hook，取消扫描全部目录后的自动入队，保留手动索引和用户明确确认的收件箱队列；同步更新功能文档和回归测试，防止后续重新引入隐式算力消耗。

## 视觉实体标签必须把模型证据和人工目录分开

- 零样本标签的相似度只说明画面与固定语义词的接近程度，不能直接升级成人物身份、物体检测或说话人结论。
- 用户改名、别名、隐藏和合并属于本地维护层，应写入独立的目录文件并在搜索结果投影时应用；不要批量改写 `video_evidence`，否则模型重算、源指纹和人工数据会互相污染。
- 目录更新需要限制名称 / 别名长度、去重并拒绝合并环；写入使用临时文件加 `rename`，重启后要用持久化测试验证恢复。

## Electron GPU 参数必须在 ready 前同步决定
- `app.commandLine.appendSwitch()` 不能等待异步设置文件读取后再调用；主进程应为启动早期需要的偏好提供同步、最小化读取入口，否则 Chromium 可能已经初始化，开关只会部分传播到子进程。
- “开启 GPU”不能用 `--no-zygote` 代替，进程启动方式和硬件加速是两个独立语义；遇到 Linux GPU 合成失败时，应该只在明确关闭或环境强制时追加 `disable-gpu` / `disable-gpu-compositing`。
- Renderer 的 `window.location.reload()` 不会重新初始化 Electron 主进程，也不会重新应用 command-line switch；涉及启动参数的设置必须先等待落盘，再通过主进程 `app.relaunch()` 重启。
- `electron-vite dev` 会在 Electron 子进程退出时让 dev server 一起退出；开发环境不能直接用 `app.relaunch()`，否则新 Electron 进程会失去 Renderer dev server 而黑屏。需要由外层 supervisor 根据专用退出码重启整个 dev server。

## 2026-08-13：Electron Smoke 重载后必须重新进入目标面板

- 现象：复制集合 Smoke 在保存集合后调用 `page.reload()`，随后直接等待 `.vision-panel`，但应用重载会回到默认播放页，导致等待视觉面板超时；这不是复制 IPC 或数据持久化失败。
- 经验：Electron Smoke 中 `page.reload()` 只证明应用重新启动，不能假设 Renderer 会恢复上一次的面板路由；重载后必须重新执行目标入口点击，并再次等待目标面板。
- 处理：在复制集合 Smoke 的重载路径中重新点击“影视库搜索”标签，再执行集合按钮交互；修正后的真实 Smoke 已验证新旧集合 ID、继承数据和副本独立修改。

## UI 操作按钮不能允许文案在 flex 中被压缩换行
- 设置页底部操作区同时放置说明文字和操作按钮时，按钮组必须保持不可压缩，按钮文案必须 `white-space: nowrap`；否则另一个 `width: 100%` 的按钮会挤压相邻按钮，中文标签会被断成两行。
- 窄屏适配应让按钮组整体换行，而不是让单个按钮内部换行；共享的次要按钮和 ASR 操作按钮需要统一遵循这个规则，避免同一问题在缓存、引导和面板操作中重复出现。

## 高频主题切换不能只放在设置里
- 主题模式虽然需要保留“浅色 / 深色 / 跟随系统”的精确选择，但一键切换属于高频操作，不能只藏在设置弹窗；标题栏工具组应提供可见的主题按钮，手动模式在浅色和深色之间切换，跟随系统模式按当前系统主题切换到另一种，设置页继续负责恢复三态选择。

## Release 工作流不能让隐式发布和可选 artifact 互相打架

- Windows ARM64 的 FFmpeg 依赖不能下载 BtbN 的 `latest` 标签：该标签在自动构建发布窗口内会短暂没有目标资产，导致 `Invoke-WebRequest` 返回 404。发布工作流应固定到带时间戳的 `autobuild-*` 标签、固定资产名和 SHA-256，避免“最新标签”移动或发布竞态破坏整轮构建。
- Ubuntu 24.04 GitHub Runner 的仓库不提供 `libkvazaar-dev`，不能把它作为 Linux 发布前置依赖；libheif 的 Linux CI 编译应使用 Runner 可用的 x265 开发包，并同步修改 encoder 参数，先在真实 Runner 上验证 apt 安装步骤。
- Ubuntu 24 的新版 `jpeglib.h` 会让固定版本 libheif 的 `jpeg_write_icc_profile` 兼容声明在 C++ 编译阶段冲突；Linux CI 构建该固定源码时需要显式使用 `CXXFLAGS=-fpermissive`，不能只看 CMake configure 成功。
- Ubuntu 的 `libx265-dev` 提供动态库时，不能继续给 libheif 传 `--static-link`；否则会在链接阶段报 attempted static link of dynamic object。Linux 包应依赖系统 FFmpeg/编解码运行库，macOS/Windows 再分别使用各自的静态或自包含方案。
- electron-builder 在 tag 构建且设置 `GH_TOKEN` 时会触发隐式 GitHub / Snap Store 发布；如果工作流同时还有独立的 artifact 汇总和 Snapcraft 发布 job，就会出现重复上传、Linux job 依赖本机 snapcraft，甚至平台构建阶段先于正式 release 发布的问题。平台构建必须显式使用 `--publish never`，发布动作统一收口到后置 job。
- Chocolatey 安装 FFmpeg 后，Windows Runner 上的 `Get-Command ffmpeg` 可能只返回 `C:\ProgramData\Chocolatey\bin` 下的 shim；不能把这个 shim 当作可携带运行库。发布脚本必须从 Chocolatey 的实际 `lib\ffmpeg` 安装目录解析 `ffmpeg.exe` 和同目录的 `ffprobe.exe`，再暂存到应用资源中并执行验证。
- Snap 构建依赖 Snap Store、core22、snapcraft 和网络，单次 `snap install` 或 `snapcraft pack` 失败不能直接等同于配置错误；安装和打包要做有上限的指数退避重试，并且重试循环最后一次失败必须显式 `exit 1`，不能让最后一个 `sleep` 把失败步骤伪装成成功。
- `publish-snap` 不能只依赖 `publish-release`，否则 `build-snap` 失败后 release 仍会成功、后置 job 再因找不到 artifact 产生第二个红色失败。汇总 release 必须等待真正会上传的 artifact，后置发布 job 也要直接依赖产物 job，确保失败原因只保留在最初失败点。
- Snapcraft 的 `pack` 失败后不能在同一个 `parts` / `stage` / `prime` 状态上直接重试；dump part 可能已经留下部分安装文件，下一次会把原本的根因放大成大量 `cp ... File exists`。每次重试前必须清理 Snapcraft 生成目录和旧 `.snap`，再从干净状态重新打包。
- Flatpak 的 npm `optional` 平台包不能等同于“不会进入最终包”：`package-lock.json` 仍会把 LanceDB、ONNX Runtime、Sharp/libvips 和 sherpa-onnx 的预编译平台包或安装脚本记录进离线 source 清单。处理这类依赖时，必须先用 `npm run flatpak:audit-native` 按 lockfile 建立证据，再决定源码重建或在 Flatpak 版明确关闭能力；不能只按当前 macOS 安装结果判断 Linux Flathub 合规性。
- Flathub 的源码构建应交给 Flathub/Linux 构建环境；本地 macOS 编译 LanceDB 只能是可选的排障手段，不能在未确认 Flatpak 功能边界前作为实施路线，更不能把本地构建产物带入 manifest。
- GitHub runner 没有用户图形会话时，Flatpak workflow 不能依赖 `flatpak-builder --install-deps-from=flathub` 通过用户 D-Bus 安装 SDK；应先显式安装 runtime、BaseApp 和 SDK extensions，再让 builder 直接使用已安装依赖。
- 本项目的无头 CI 应由 `dbus-run-session` 包住 Flatpak 安装与构建命令，并使用 Runner 上的 `flatpak-builder` CLI；不要用 `xvfb` 伪造显示器，也不要在容器化 `org.flatpak.Builder` 内重复运行构建，以免用户 Flatpak 安装目录对 builder 不可见。
- Flatpak 构建不能只依赖 `ffmpeg.org` 的源码归档下载；该站点在 GitHub Actions 上可能出现 TLS 超时。FFmpeg 仍固定同一版本时，优先使用官方 GitHub 仓库的固定 tag 与 commit，避免因源码站点瞬时不可达阻断构建。
- Flatpak 依赖若用 `flatpak install --user` 安装，后续 `flatpak run`、builder 和 lint 也必须显式带 `--user`；否则会从系统 Flatpak 目录查找 SDK，产生“已安装但找不到 runtime”的假失败。
- GitHub runner 上使用 `org.flatpak.Builder` 容器调用 builder 时，用户 SDK 目录可能对容器内的 Flatpak 查找不可见；优先安装 Ubuntu 的 `flatpak-builder` CLI，在宿主机直接使用已安装的 SDK，减少嵌套 Flatpak 的目录隔离问题。

## 2026-08-10：Flatpak 源码编译产物不能只安装不接线

- 现象：manifest 已经在 Flatpak builder 内编译 LanceDB Rust NAPI addon 并安装到 `/app/lib/aivplayer`，但启动 wrapper 没有指定加载路径；NAPI-RS 仍可能回退到 npm 平台预编译包，导致“源码已编译”不等于“运行时使用源码产物”。
- 经验：涉及原生模块时必须同时检查构建产物、安装路径和运行时加载入口，不能只看 builder 日志里的编译成功。
- 处理：wrapper 按 `uname -m` 设置 `NAPI_RS_NATIVE_LIBRARY_PATH`，并把 x86_64 / ARM64 两条路径纳入静态检查。

## 2026-08-10：固定源码 commit 的检查需要完整 Git 历史

- 现象：本地 `flatpak:check` 能验证 manifest 固定的应用源码 commit 包含桌面入口、MetaInfo、图标和截图，但 GitHub Actions 默认 `actions/checkout` 只拉取深度为 1 的当前提交，远程静态检查因此误报源码 commit 缺少文件。
- 经验：凡是用 `git cat-file <commit>:<path>` 验证可重建输入的 CI 检查，必须显式保证对象已被 checkout；不能把本地完整 clone 的结果当成 CI 默认行为。
- 处理：Flatpak 静态检查 job 使用 `fetch-depth: 0`，让固定 commit 的内容校验与本地、远程语义一致。

## 2026-08-11：Flatpak CI 临时 manifest 不能直接交给 Flathub linter

- 现象：CI 为使用当前 checkout 构建，会生成 `flatpak/ci-manifest.yml`；Flatpak builder 能正常完成构建，但 Flathub linter 按文件名校验时把它识别为 `ci-manifest`，与应用 ID `cn.quniv.aivplayer` 不一致，触发不可豁免的 `appid-filename-mismatch`。
- 经验：本地源码替换 manifest 只适合 builder 输入，最终 linter 必须检查正式命名的 manifest；构建输入和审核输入不能混用。
- 处理：CI 继续使用 `ci-manifest.yml` 构建，但 lint 改为检查正式的 `flatpak/cn.quniv.aivplayer.yml`。

## Electron 打包不能依赖自动安装的 peer dependency

- `@lancedb/lancedb` 的运行时代码会直接 `require("apache-arrow")`，但它把 Apache Arrow 声明为 peer dependency。npm 在开发机上可能把这个 peer 自动安装到顶层 `node_modules`，造成开发态误以为依赖完整；electron-builder 只按应用的生产依赖收集资源时则可能把它漏出 `.app`，最终主进程在启动阶段报 `Cannot find module 'apache-arrow'`。
- Electron 主进程会在应用启动时加载视觉影视库服务，所以 Finder 的“打开方式”只是暴露问题的入口，视频文件名、外置磁盘路径和 MP4 编码都不是根因。凡是被打包运行时代码直接 require 的 peer dependency，都必须在根 `package.json` 的 `dependencies` 中显式固定版本，并通过生产构建检查实际进入应用资源。
- Snapcraft dump plugin 默认用 `cp --link` 把 Electron 的 `linux-unpacked` 目录放进 part install；当前 Electron 产物包含多平台原生模块和大量文件，GitHub runner 上会在复制阶段只返回 `None` 而退出 1，日志没有给出可操作的源文件。对已生成的本地目录不要继续依赖 dump plugin，改用 nil plugin + `CRAFT_PART_INSTALL` + 普通 `cp -a` 显式复制，才能把构建产物稳定送入 Snap。
- Snapcraft 的 `apps.<name>.desktop` 路径必须和仓库中的 `snap/gui/*.desktop` 真实路径一致；只把文件放在 `snap/local` 并不能满足 metadata 生成阶段，最终会在 `Copying snap assets` 报 `file does not exist`。
- Snapcraft 9 已移除 `snapcraft login --with -` 参数；历史上的直接 Snapcraft 发布方案需要把 `SNAPCRAFT_STORE_CREDENTIALS` Secret 注入上传步骤，让 Snapcraft 从环境变量读取凭据，否则会以退出码 64 失败。当前项目已改为通过 electron-builder 的 `SNAP_CSC_LINK` 入口发布，不再直接注入该原生变量。

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

## 播放状态不能由多个异步入口各自猜测

- 现象：视频实际已经在播放，但播放按钮偶尔仍显示播放；或者媒体切换、循环播放、编辑预览切源后，按钮状态与真实 `<video>` 状态短暂甚至长期不一致。
- 原因：同一个 `<video>` 元素跨媒体复用，旧媒体的 `pause` / `ended` / `timeupdate` 事件可能落到新媒体状态；同时 `onPlay`、`onPause`、自动播放 Promise、播放结束策略和编辑切源逻辑分别直接写 `isPlaying`，异步顺序变化时会互相覆盖。
- 经验：播放状态必须以当前媒体元素的 `!paused && !ended` 为唯一事实来源，所有事件和 `play()` / `pause()` Promise 都走同一个同步函数；切换媒体前先暂停，并按媒体 URL 更换 `<video>` 实例隔离旧事件。仅更换实例还不够，旧实例已经排队的事件和 Promise 回调仍必须用 `ref` 做身份校验，不能回写当前媒体的进度、音量、元数据或播放状态。任何独立的预览播放器（例如剪辑导出预览）也必须复用相同规则，不能再维护一套只由按钮动作驱动的布尔状态。

## 2026-08-20：媒体身份校验必须覆盖延迟执行的 updater

- 现象：视频已经在播放，按钮仍偶发显示播放图标；入口事件本身已经检查了当前 `<video>`，但 React 批量更新或媒体切换后仍可能留下错误状态。
- 原因：只在调用 `setState` 前比较一次 `videoRef.current` 不够，函数式 updater 可能在稍后的渲染批次才执行；这期间 ref 已经指向另一媒体，旧 updater 仍会把旧媒体的 `paused` 结论写入当前播放器。
- 经验：媒体身份检查要同时发生在入队前和 updater 真正执行时。跨媒体同步入口传入“读取最新 ref”的 getter，不能把某一时刻的 `currentMedia` 快照当成长期有效的身份证明；独立预览播放器也必须复用这一层保护。

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

## 2026-08-10：字幕 QA 自动修复必须只覆盖可证明安全的时间问题

- 现象：QA 能发现重叠、过短和过长 cue，但如果把所有问题都交给自动文本修复，可能误改用户原文、双语对应关系或源字幕旁车；直接把短 cue 延长也可能撞上下一条字幕。
- 经验：自动修复应限制在确定性的时间变换：重叠只截断前一条的结束时间，过长只收缩时长，过短只在下一条同轨字幕和时间线末端之间有空间时延长；标点、识别、行宽和 CPS 问题必须继续人工处理。
- 处理：新增 `repairSubtitleQaIssues` 纯函数，复制输入、不改文本，时间修改会解除 source anchor 并裁剪 word timing；编辑器通过显式按钮一次提交，沿用现有工程 undo / redo / 保存链路。

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

## 2026-08-08：TTS 试听必须区分 provider 探测、音频协议和草稿确认

- 现象：macOS `say` 不支持通用的 `--version` 参数；即使命令本身可用，能力卡也会显示不可用。TTS 默认输出 AIFF，如果媒体协议没有对应 MIME，Chromium 的 `<audio>` 也可能无法加载。
- 经验：平台特有命令要使用其真实的无副作用探测方式；派生音频的扩展名、MIME、虚拟媒体 URL 和浏览器加载状态必须作为一条完整链路验证，不能只看命令返回成功。
- 处理：macOS 改用 `say -v ?` 探测，媒体 MIME 增加 `.aif/.aiff -> audio/aiff`，Smoke 使用可播放的假 provider 并断言音频元数据已加载。

## 2026-08-08：TTS 结果事件必须按 kind 隔离

- 现象：OCR 和 TTS 共用一个进度 IPC；如果每个任务卡都接收所有事件，TTS 完成时 OCR 卡片会被替换成 TTS 状态，用户和 Smoke 都会看到错误的持久化信息。
- 经验：共享事件通道可以复用，但每个 UI 消费者必须先按任务 kind 过滤，再更新自己的状态；测试应同时断言两个卡片的状态没有串线。
- 处理：OCR / TTS 监听分别只接受对应 kind，真实 Smoke 在 TTS 完成后继续校验 OCR 仍保持 `persisted`。

## 2026-08-08：试听结果不能隐式写回正式字幕

- 现象：把 TTS 文本直接复用正式字幕写回接口，会绕过人工试听和文本确认，可能修改播放器当前字幕或源视频旁车字幕。
- 经验：试听音频、字幕草稿和正式字幕必须有三个清晰边界；草稿保存必须是显式动作，并落到独立用户目录，不得依赖播放器当前字幕路径。
- 处理：新增独立 `evidence-draft:save` IPC，保存前重算媒体指纹并生成 `evidence-drafts/*.vtt`；Smoke 验证确认前无草稿、确认后只有独立 VTT，正式字幕旁车文件不存在变化。

## 2026-08-08：任务修改必须按功能边界分阶段提交

- 现象：一次任务同时修改核心协议、IPC、UI、Smoke 和工程文档时，如果一次性提交，会让 review 无法区分行为变化、界面变化和验证脚本变化。
- 经验：每个功能边界都应先通过定向检查，再只暂存相关文件、扫描敏感信息并提交中文 commit；后续模块继续工作时保持工作区干净，方便回溯和拆分。
- 处理：本轮按“草稿 IPC 核心”“macOS TTS 探测”“TTS UI”“AIFF MIME”“Electron Smoke”“工程记录”分阶段提交，未把内部计划文件加入仓库。

## 2026-08-08：TTS provider 设置必须保留环境变量和平台默认优先级

- 现象：如果设置页保存了一个不可执行路径，或者把 macOS `say` 的默认行为硬编码到所有平台，能力诊断和实际任务执行会出现不一致；Smoke 也可能因为设置残留而覆盖注入的假 provider。
- 经验：任务执行时应保持 `AIVPLAYER_TTS_PATH` 优先，其次读取持久化 provider，最后才使用 macOS 平台默认值；设置页只负责保存显式配置和展示诊断，不复制一套 provider 解析逻辑。
- 处理：新增 `tts` 设置段和 schema 迁移，能力诊断复用主进程解析结果；真实设置 Smoke 验证路径、voice 写回，并等待异步探测从“检查中”进入最终状态。

## 2026-08-08：字幕草稿列表和正式导入必须继续隔离

- 现象：只有 VTT 文件没有 manifest 时无法可靠展示来源媒体、时间范围和文本；如果导入接口直接信任 Renderer 传入的草稿路径或媒体路径，还可能把一个媒体的草稿写到另一个媒体的正式字幕旁车。
- 经验：草稿目录只由主进程管理，manifest 记录媒体路径、源指纹、时间范围和文本；ID 使用固定格式校验，导入时同时校验解析后的媒体路径和当前源指纹。正式字幕存在时必须返回可观察的覆盖确认状态，而不是隐式覆盖。
- 处理：新增草稿列表 / 删除 / 导入 IPC，manifest 与 VTT 原子写入；正式导入同时生成 VTT / SRT，覆盖确认后才通过 `AsrSubtitleResult` 挂载到播放器。Smoke 覆盖首次导入、重复导入触发确认、确认覆盖和删除草稿。

## 2026-08-08：Electron Smoke 的异步按钮不能只断言“已出现”

- 现象：覆盖确认按钮会先渲染为 disabled，再等待上一个 IPC Promise 的 finally 清理 busy 状态；Smoke 只等待按钮出现就点击，会在真实 Electron 中超时，掩盖实际流程是否成功。
- 经验：UI Smoke 要区分“元素出现”和“元素可操作”，对异步按钮同时等待 `disabled=false`，并对 provider 诊断等待最终状态，不能把中间态当成通过。
- 处理：补充覆盖确认和 provider 诊断的可用态等待；设置 Smoke 同时修正为项目当前 light theme token `rgb(246, 244, 241)`，避免旧基线造成假失败。

## 2026-08-08：多 cue 草稿合并必须先规范化再生成身份

- 现象：把多个单 cue 草稿直接拼接到一个 VTT 文件，容易产生乱序、重叠、空文本和重复 ID；如果草稿 ID 仍只按第一条 cue 生成，修改后的合并结果还可能覆盖错误草稿。
- 经验：多 cue 是主进程边界，不应只在 Renderer 里拼数组。保存、读取、正式导入和格式转换都必须使用同一份规范化 cue 列表，并把完整 cue 内容纳入稳定身份计算。
- 处理：新增统一 cue 校验与排序，拒绝重叠区间、非法时间和超长文本；旧版单 cue manifest 在读取时转换为单 cue 列表。合并只允许同一媒体指纹，Smoke 用 VTT / SRT 内容和两个播放时间点验证结果。

## 2026-08-08：正式字幕副作用不能成为唯一 Smoke 成功条件

- 现象：正式字幕导入后，字幕证据写入 `video_evidence` 可能是异步副作用；有时在 Smoke 结束前已出现，有时文件和播放器 overlay 已完成而证据表尚未写入，强制要求固定行数会造成时序假失败。
- 经验：Smoke 应把用户可见、确定性强的结果作为主断言（VTT / SRT 内容、覆盖确认、播放器时间点显示），对异步附带索引只做条件校验；核心 OCR / visual 隔离和 stale 媒体保护仍要严格断言。
- 处理：多 cue Smoke 严格检查 1 条 OCR、1 条 visual 和无 stale 路径；字幕证据若已出现则必须是两条完整文本，否则允许异步写入尚未完成，避免把后台时序误报成导入失败。

## 2026-08-08：正式字幕回填必须绑定当前媒体路径

- 现象：正式导入只更新当前 Renderer 状态，切换到另一视频再切回时状态已被清空；如果恢复逻辑只保存一个全局“最近字幕”，就会把上一媒体的字幕显示到下一媒体。
- 经验：旁车字幕是媒体路径级资源，恢复时必须由主进程根据当前媒体路径重新解析 `.vtt` / `.srt`，并在异步返回前检查取消状态；同目录 VTT 优先，只有 SRT 时也要保持可播放解析。
- 处理：新增 sidecar resolver 和独立 IPC，缓存 effect 先恢复当前媒体旁车字幕，再回退到 ASR 缓存；真实 Electron Smoke 重启恢复 stable 媒体字幕，并打开无 sidecar 的 isolated 媒体确认 overlay 为空。

## 2026-08-08：视觉索引重建不能覆盖 OCR 等派生证据

- 现象：OCR 通过单条 upsert 落库后，启动时自动视觉索引或字幕旁车变化触发的 evidence 重建会按媒体路径整体删除行，导致 OCR 搜索结果偶发消失。
- 经验：索引器管理的 `subtitle` / `visual` 行和任务产生的 OCR、scene、entity 行必须分层；重建时只替换前者，并且只保留当前媒体指纹的派生证据，媒体被替换后不能复用旧证据。
- 处理：`replaceEvidenceRows` 在重建前读取并保留同指纹非视觉 / 非字幕行，旧媒体指纹的派生行随重建清理；Smoke 覆盖自动索引并发后 OCR 仍可搜索定位。

## 2026-08-08：正式字幕恢复不能只依赖“文件存在”

- 现象：VTT / SRT 文件即使存在，也可能只有头部、坏时间码或空 cue；如果 sidecar resolver 只做 `stat`，Renderer 的宽松解析器会跳过坏块，界面看起来像恢复成功但实际没有可显示字幕。
- 经验：正式旁车进入播放器前必须在主进程完成格式、cue 数量、时间范围和文本校验；无效旁车要返回稳定错误码，Renderer 展示失败提示并停止缓存回退，避免旧缓存掩盖当前文件损坏。
- 处理：新增 sidecar validator、`INVALID_SUBTITLE_SIDECAR` 错误码和四语言提示；真实 Smoke 写入坏 VTT，打开字幕面板后确认提示可见且 overlay 为空。

## 2026-08-08：媒体指纹必须由所有派生链路共享

- 现象：视觉索引使用 `path:size:mtime`，OCR 任务和字幕草稿却使用另一种 SHA 文本；索引重建无法识别同一媒体的 OCR 行，TTS 草稿保存也会被错误判定为媒体已变化。
- 经验：媒体版本指纹应由单一纯函数生成，索引、OCR、TTS 草稿保存 / 导入都复用；变更格式时要保留旧数据的只读兼容校验，不能让升级直接让旧草稿失效。
- 处理：统一 `createVisionSourceFingerprint`，OCR / 草稿 IPC 改用同一格式，草稿导入兼容旧 SHA；定向测试和真实 Smoke 同时验证 OCR 可搜索、草稿可保存、旧派生行不会被索引重建删除。

## 2026-08-08：Electron Smoke 必须先打开承载断言的可见面板

- 现象：坏旁车 IPC 已返回 `INVALID_SUBTITLE_SIDECAR`，但 Smoke 直接查询字幕卡片时失败，因为默认面板不是 ASR；这会把“用户看不到提示”和“业务没有返回错误”混成同一个失败。
- 经验：UI Smoke 的断言前置条件也要显式操作，例如先切换到 ASR 面板，再检查稳定 `data-testid`；IPC 诊断和用户可见 DOM 断言应同时保留。
- 处理：Smoke 先打开 ASR 标签，再确认失败提示、空 overlay 和 IPC 返回值；新增启动失败时的诊断信息，后续排查可以区分数据链路和面板可见性。

## 2026-08-08：同一路径正式字幕覆盖必须携带源 revision

- 现象：翻译缓存文件按源字幕正文哈希生成新路径，但 Renderer 只按 `subtitlePath`、语言、模型和 glossary 判断上下文；正式字幕覆盖后同名 sidecar 路径不变，旧译文仍可能留在内存状态并继续显示。
- 经验：缓存命中键和 UI 当前状态是两层边界，不能只依赖文件缓存自然 miss。正式字幕导入、旁车恢复和翻译结果必须共享可比较的源字幕 revision；revision 已变化时要先清理旧结果，再尝试恢复新缓存。
- 处理：主进程计算 VTT / SRT 最大 mtime revision，翻译结果和 manifest 记录 `sourceSubtitleRevision`；Renderer 严格比较当前 source revision；编辑器把 source revision 纳入双轨字幕加载 effect，但继续用脚本 merge 保护人工修改。

## 2026-08-08：Electron Smoke 的环境变量不等于 Renderer 已保存配置

- 现象：Smoke 进程可以通过环境变量让主进程调用本地假翻译服务，但 Renderer 的 AI 设置守卫仍读取持久化 AppSettings，切换目标语言时会弹出设置遮罩，导致按钮点击测试误判为缓存失败。
- 经验：涉及配置守卫的 UI Smoke 必须同时验证用户态设置写回；测试桩可以用环境变量提供服务，但要把临时 endpoint / model / fake key 写入隔离 user-data 后再重载窗口，才能覆盖真实恢复链路。
- 处理：Smoke 通过 preload IPC 生成翻译缓存，将本地假服务配置写入临时设置并重启 Renderer，随后验证翻译状态恢复；覆盖导入不同正文后等待旧翻译状态消失，再检查新 source 和重启恢复。

## 2026-08-08：总结缓存也必须绑定当前字幕 revision

- 现象：总结文件虽然按字幕正文哈希生成不同路径，但 Renderer 状态、总结来源和导出 Hook 仍可能只看路径 / 模式；同一路径正式字幕覆盖后，旧总结可能在缓存 effect 清理前继续显示，甚至被复制或导出。
- 经验：缓存文件键只能解决“下次查找命中哪个文件”，不能替代当前 UI 状态校验。总结结果、manifest、原文 / 译文来源选择和导出入口必须共享 source path、source type、source revision、语言、模型和模式这一组上下文。
- 处理：总结 IPC 返回 `sourceSubtitleRevision`，manifest key 纳入 revision；Renderer 将译文输出 revision 传给总结来源选择，缓存恢复和导出前严格校验上下文；真实 Electron Smoke 生成旧总结、覆盖正式字幕并验证当前面板和重启后均不再出现旧总结。

## 2026-08-08：Smoke 修改面板状态后必须恢复下一步操作的可见前置条件

- 现象：总结清理断言需要切换到 Summary 面板，随后脚本直接点击 Vision 面板中的草稿删除按钮，Playwright 会等待不可见元素直到超时；业务断言其实已经通过，失败来自 Smoke 编排。
- 经验：每个 UI 断言 helper 都应明确自己的面板副作用；helper 返回后不能假设调用者仍停留在原面板，下一次定位前要显式切回承载控件的面板。
- 处理：总结清理 helper 后显式切回 Vision 面板再删除草稿，并重跑真实 Electron Smoke；以后把面板切换视为 Smoke helper 的可观察契约。

## 2026-08-08：LanceDB 视觉证据行不能用固定自定义 ID 作为唯一回归条件

- 现象：Smoke 通过 LanceDB 插入一条固定 `smoke-visual-evidence` 后，真实播放器启动会继续按时间片生成视觉证据；在当前 LanceDB 行为下，固定 ID 可能不再出现在最终查询结果，导致“视觉行必须恰好一条”的断言误报。
- 经验：对异步索引副作用，应断言用户关心的稳定事实——稳定媒体至少有视觉证据、没有 stale 媒体行、OCR / 字幕数量和文本正确；不要把存储层自动生成的分段 ID 或固定行数当成唯一成功标准。
- 处理：Smoke 改为按 `evidence_type=visual` 且绑定稳定媒体路径统计视觉行，并在失败信息中输出各类型计数；真实重跑得到 `evidenceRows:24`、`ocrRows:1`、`subtitleRows:1`、`visualRows:22`。

## 2026-08-08：正式字幕改写后不能继续复用旧词级 sidecar

- 现象：正式字幕正文已经更新，但旧 Whisper JSON 的词级文本仍可能被直接挂载；项目存储看似正确，编辑器却显示旧词或旧时间。
- 经验：词级 sidecar 不是只要文件存在就能复用，必须把拼接后的词文本与当前 cue 文本比较；不一致时宁可回退到无词级数据，也不能展示过期词。
- 处理：新增 `areEditingCaptionWordsCompatible` 校验和单测；真实字幕冲突 Smoke 覆盖改写后的文本、保留编辑与强制重载，避免旧词级数据污染当前轨道。

## 2026-08-08：字幕冲突验证应使用独立 Smoke 边界

- 现象：把字幕重载流程插入已有覆盖大量图形、时间线和选择态的长 Smoke 后，页面 reload 会重置后续断言需要的选择状态；失败看起来像业务回归，实际是 Smoke 编排互相污染。
- 经验：新增模块应拥有最小、独立、可重复的真实 Electron Smoke；既验证用户关键路径，也避免依赖旧 Smoke 的隐含状态。
- 处理：新增 `smoke:editing-caption-reload`，只覆盖冲突预览、保留当前编辑、强制重载和截图证据；原有长 Smoke 保持原职责。

## 2026-08-08：跨层任务必须按边界分阶段提交

- 现象：核心模型、Renderer、Smoke 和文档同时变化时一次提交会让 review 难以区分数据契约、界面行为和验证脚本。
- 经验：每个阶段先做定向验证，只暂存该阶段文件，扫描 staged diff 后再提交中文 commit；内部计划文件继续保持 ignored。
- 处理：本轮拆为 `2346b57`（核心模型与冲突预览）、`bd05d94`（Renderer/UI 接入）、`cf8a024`（独立 Smoke 与词级 sidecar 守卫），文档随后单独提交。

## 2026-08-08：编辑器表单状态不能被同一对象的变换更新重置

- 现象：选中图形后编辑表单默认展开并覆盖画布；画布移动触发父状态更新时，编辑器 effect 又把表单重新打开，后续缩放 / 旋转事件被表单截获。
- 经验：组件 effect 同时承担“同步外部字段”和“切换对象时打开面板”时，必须按稳定身份区分两种副作用；同一对象的持久化更新不能改写用户当前的开合状态。
- 处理：`EditingGraphicEditor` 只在 `graphic.id` 变化时自动展开；Smoke 在画布交互前显式关闭编辑表单，并验证移动、缩放、旋转及撤销状态。

## 2026-08-08：画布辅助控件必须避开父级裁切和时间线层级

- 现象：旋转手柄放在图形框外侧时，视频帧的 `overflow: hidden` 和下方时间线的高 z-index 会让真实鼠标事件命中时间线；编辑模式字幕菜单同样可能被时间线遮挡。
- 经验：画布辅助控件应优先放在可交互容器内部，并用实际 `elementFromPoint` / Playwright 命中证据检查层级；只看 bounding box 或元素可见不足以证明用户能操作。
- 处理：旋转手柄移入图形框内部并提升自身层级，编辑模式字幕菜单提升到时间线之上；完整 `smoke:editing-script` 最终通过且 `Console errors: []`。

## 2026-08-08：大规模字幕冲突不能在核心层截断预览

- 现象：核心 diff 为了控制 UI 高度只保留前 12 条，summary 计数虽然完整，但用户无法搜索或确认后续 cue 是否被新增、删除或修改。
- 经验：数据层必须保留完整、可审计的差异；展示层再负责分页、筛选和滚动，不能让 UI 展示上限反向改变冲突事实。
- 处理：移除核心层的 12 条截断，新增纯函数按关键词、变更类型、字幕轨和页码筛选；真实 Electron Smoke 使用 18 条 cue 验证 8 条分页、第二页、搜索命中和无匹配提示。

## 2026-08-08：时间范围筛选必须同时考虑 cue 的旧区间和新区间

- 现象：字幕版本更新可能同时改变文本和时间轴；如果只保存 incoming 时间，用户按原视频时间定位时会漏掉旧区间仍有影响的 changed / removed cue。
- 经验：差异记录应保留 current / incoming 两套起止时间；时间筛选使用两套区间的并集做重叠判断，单独填写起点或终点也应有明确的开放区间语义。
- 处理：为 change 增加旧 / 新时间字段和范围 helper，UI 显示 `mm:ss.t` 标签并提供起止秒输入；Smoke 用 `18–19.5s` 唯一定位第 10 条 cue，再继续完成搜索、保留和强制重载。

## 2026-08-08：差异审阅必须与编辑播放头联动

- 现象：只有文字和时间标签的冲突列表仍需要用户手动在时间轴寻找 cue，长字幕审阅成本高，也容易定位到相邻句子。
- 经验：冲突 row 应提供 current / incoming 两个明确定位动作；added / removed 不存在对应时间时必须禁用该侧按钮，不能用另一个版本的时间冒充定位点。
- 处理：新增 `onSeek` 接口和当前 / 新字幕定位按钮，真实 Electron Smoke 搜索第 10 条 cue 后点击新字幕定位，验证 `editing-time-readout` 跳到 `00:18`，再继续保留和强制重载。

## 2026-08-08：差异定位必须复用时间轴统一选中状态

- 现象：只调用 `seekEditingTime` 可以移动播放头，但脚本面板和字幕轨不会告诉用户当前审阅的是哪一条 cue；如果单独维护局部高亮，还会与时间轴已有的多选状态分叉。
- 经验：差异定位应复用 `selectTimelineItem('caption', segmentId)`，同时更新脚本面板的 selected segment；translation diff 先映射回 source script segment，added 且当前工程不存在的行保持不可选。
- 处理：冲突组件增加 `onSelectScriptSegment`，时间线统一接入脚本 / 字幕双选中态；Smoke 验证脚本 row 和 caption item 都包含 `is-selected`。

## 2026-08-08：Smoke 不应写死带随机 fingerprint 的 cue ID

- 现象：首次 Smoke 用 `source-caption-10` 作为 DOM test id，实际 loader 会把媒体 fingerprint 生成的随机 source ID 拼进 cue ID，导致功能已选中但测试找不到元素。
- 经验：涉及媒体 fingerprint、临时目录或持久化生成 ID 时，Smoke 应按稳定可见文本 / 时间范围定位目标，再读取实际 test id；不要把存储层随机值当用户行为契约。
- 处理：Smoke 按“原始字幕 10”定位脚本行和字幕卡片，随后验证它们的实际 class 都包含 `is-selected`；真实重跑通过并保留选中态截图。

## 2026-08-08：新增字幕预览不能伪造当前工程实体

- 现象：incoming-only cue 在强制重载前不存在于当前 `scriptSegments` / captions；如果直接调用统一选中入口，会留下旧选中态，或制造一条不可持久化的假行。
- 经验：预览必须是独立、只读、临时 overlay；点击 added cue 时先清空旧选择，只显示 incoming 文本和时间范围；关闭、保留当前编辑或强制重载时清理预览。
- 处理：新增 core preview helper、时间线状态条和临时字幕卡片；真实 Electron Smoke 验证预览出现、旧脚本行取消选中、关闭后两个 preview DOM 均消失，并确认控制台无错误。

## 2026-08-08：source / translation cue 配对必须覆盖真实 loader ID

- 现象：简化单测中的 translation ID（`translation-source-caption-2`）可以直接去掉 `translation-` 与 source ID 对齐，但真实 loader 生成的是 `source-${sourceId}-${index}` 与 `translation-${sourceId}-${index}`；只使用单一字符串映射会导致译文临时卡片不出现。
- 经验：涉及持久化 ID 的跨轨配对，单测既要覆盖人为构造的稳定 ID，也要覆盖真实 loader 生成形态；不能因为一个简化 fixture 通过就认为配对契约完整。
- 处理：新增 source segment 配对的兼容归一化，双轨 Smoke 使用真实旁车路径和 19 个 cue 验证 source / translation 两张预览卡片、对照文本和时间范围同时出现。

## 2026-08-08：多轨时间筛选 Smoke 不能假设单条结果

- 现象：changed source 与 translation 共享同一时间移动后，时间范围筛选会正确返回两条轨道；Smoke 仍用单元素 `textContent()`，Playwright strict mode 因 locator 命中 2 个 row 失败。
- 经验：跨轨筛选的结果数量本身是用户可见契约，Smoke 应先断言轨道数量，再用 `allTextContents()` 聚合文本；不要为了复用单轨断言把合法的多轨结果压成一条。
- 处理：Smoke 明确断言 changed track 数量为 2，并验证两条 row 都保留旧 / 新并集时间 `00:18.0–00:20.5`；真实重跑通过且 `consoleErrors:[]`。

## 2026-08-08：持续任务也必须保持小提交边界

- 现象：字幕冲突功能同时涉及核心算法、Renderer、Smoke 和工程记录；如果因为任务连续推进就把多层文件一次性提交，review 很难确认每一阶段的行为和证据。
- 经验：持续任务不等于可以合并提交边界；核心数据契约、界面接入、真实 Smoke 和文档仍应分别验证、分别暂存、分别提交，且每次提交前都要扫描 staged diff。
- 处理：本轮按 `a1446ac`（核心选择性接受）、`749e2e3`（撤销历史与 UI 接入）、`47c6ec3`（Electron Smoke）拆分；FEATURE / FailureExperience 另行提交，内部计划保持 ignored。

## 2026-08-08：added source / translation 必须允许分开确认

- 现象：incoming-only source 与 translation 共享同一个 source segment，但它们在冲突 diff 中是两条独立 cue；如果点击 source 的“加入工程”就隐式整对加入，用户无法保留其中一条，也会让撤销粒度与列表行不一致。
- 经验：单条冲突操作的粒度应与 diff row 一致；source 加入负责建立脚本上下文，translation 加入负责补齐 `translationText`，两者分别进入撤销栈，才能与 changed cue 的单条接受行为保持一致。
- 处理：新增 `applyEditingSubtitleReloadAddition`，按 id / kind / incoming 快照校验后只添加一条 caption；真实 Smoke 验证 source 加入后 translation diff 仍保留 1 条，并覆盖 source 的 undo / redo。

## 2026-08-08：真实 loader 的字幕 ID 不能按简化 fixture 精确比较

- 现象：单测使用简化的 `source-caption-1` / `translation-source-caption-1` 时，单条删除看似能同时处理原文和译文；真实 loader 使用 `source-${sourceId}-${index}` 与 `translation-${sourceId}-${index}`，实际点击删除后脚本行已标记删除，但译文字幕仍留在时间轴。
- 经验：跨轨字幕操作必须复用同一套 ID 等价规则，既覆盖 translation 前缀归一化，也覆盖真实 source-prefixed 脚本段；变更、删除、预览配对和 UI 选中不能各自维护一份比较逻辑。
- 处理：新增共享的脚本段 ID 等价 helper，修正 changed / removed 的脚本段更新、source 删除时的译文联动和冲突定位；单测加入真实 loader ID fixture，Electron Smoke 验证原文删除后原文 / 译文均消失、撤销恢复 2 条、重做再次删除。

## 2026-08-08：用户再次提醒持续任务必须保持可 review 的小提交

- 现象：跨核心、Renderer、Smoke 和文档连续推进时，容易因为“任务还没结束”而把多个阶段混在同一个提交思路里，降低审阅者对数据契约、UI 接线和验证证据的区分能力。
- 经验：持续工作不改变提交边界；每个阶段仍需定向验证、只暂存相关文件、扫描 staged diff 后使用中文 commit message 提交，修复阶段也应追加独立小提交而不是重写或堆叠无关文件。
- 处理：本轮按核心删除算法、真实 ID 修正、脚本行定位、契约测试、Electron Smoke、工程文档分别提交；`OPEN_SOURCE_INSPIRATION_PLAN.md` 保持 ignored，不进入 GitHub。

## 2026-08-08：单条保留 removed cue 不能只从当前列表隐藏

- 现象：removed cue 的“保留当前字幕”如果只把一行从 React 列表中删掉，刷新工程或撤销后，字幕版本 revision 仍未真正记录，下一次加载会再次弹出同一冲突；source / translation 配对行还可能只解决一半。
- 经验：单条冲突决策同时属于工程状态和审阅状态，必须记录目标 source revision 与稳定 change key；source 行的保留 / 移除语义要和配对译文保持一致，translation 行才按单条粒度处理。
- 处理：新增可持久化的 `captionReloadResolution`，核心层按真实 loader ID 生成 related change keys，Hook 在加载、撤销、重做时过滤 / 恢复已处理差异；Smoke 验证保留后两轨仍在、差异消失、撤销后差异回来，再完成移除和重做。

## 2026-08-08：Smoke 搜索状态重置后必须重新定位分页行

- 现象：单条保留操作会更新冲突对象并重置搜索框；Smoke 等待搜索框为空后直接复用旧 row locator 点击移除按钮，实际页面已经回到第一页，locator 找不到目标按钮并超时。
- 经验：任何会重建分页 / 搜索组件的交互后，不能假设旧 locator 仍处于目标可见页；应重新填写稳定文本查询并等待唯一 row，再执行下一步。
- 处理：Smoke 在保留撤销后重新搜索“原始字幕 18”再点击移除，并保留 `keepCurrentButtonCount`、`undoKeptRemovedRows` 等结果字段，避免把编排竞态误判为业务失败。

## 2026-08-08：source 保留不能隐式解决 translation removed

- 现象：source removed 的保留逻辑沿用 source / translation 配对规则，点击后译文 removed 行也被隐藏，无法组合“保留原文、移除译文”。
- 经验：source 删除时可以成对物化移除；但冲突裁决必须按 diff row 独立记录，不能把字幕配对关系直接等价为决策关系。
- 处理：resolution key 改为精确到当前 removed row；source 保留只解决原文行，translation 可继续单独保留或移除；真实 Electron Smoke 覆盖 source keep + translation remove、translation undo / redo，以及随后 source remove 流程。

## 2026-08-08：source remove + translation keep 必须保留已裁决的译文

- 现象：source 的“从工程移除”原本无条件移除配对 translation；当用户先明确保留译文、再移除原文时，译文仍会被错误吞掉；移除后的当前 / incoming 重算还可能把已解决的 removed row 反转成 added row。
- 经验：字幕配对关系只决定默认联动，不应覆盖用户已经做出的逐行裁决；resolution key 在同一 revision 内应按 `kind:id` 识别，不能只按当下的 `status:kind:id` 精确匹配。
- 处理：source removal 读取既有 translation resolution，保留已裁决译文并继续标记脚本 `deleted`；所有单条接受 / 加入 / 保留 / 移除动作统一记录 resolution，重算 diff 过滤已处理实体；Smoke 覆盖 source remove + translation keep、冲突中其他差异继续存在，以及两次 undo 回到未裁决状态。

## 2026-08-08：Smoke 应区分目标差异已解决和整个冲突已关闭

- 现象：新组合完成后，目标 source / translation removed row 已经消失，但页面仍有其他 changed / added 差异；Smoke 如果直接等待整个 conflict DOM 消失，会把正确的部分解决误判为失败。
- 经验：多条差异的交互验证应分别断言目标 row 的消失、其余差异的保留和最终整体关闭，不要把“当前操作已完成”与“所有差异已完成”混成一个条件。
- 处理：Smoke 改为确认目标 removed row 不再出现，同时要求 conflict 仍包含其他差异；随后用撤销恢复目标字幕，再继续既有 source 成对移除回归。

## 2026-08-08：孤立译文的所有导出路径必须共用同一筛选

- 现象：source remove + translation keep 让工程里留下了 translation caption；SRT 序列化天然只输出 source，但烧录 ASS 入口原本直接消费全部 captions，导致同一个孤立译文在外置字幕和视频烧录两条导出路径表现不一致。
- 经验：导出边界不能只修某一种格式；凡是从同一工程生成字幕文件或烧录文本，都应先经过同一份“当前可导出 caption”筛选。孤立译文在没有明确独立导出契约前应保留在工程内，但排除在当前 source-led subtitle export 外。
- 处理：新增 `getEditingCaptionsForSubtitleExport`，SRT / ASS 都复用过滤结果；单测覆盖已删除 source 下的保留译文会被排除、source 仍活动时的译文不被误排除；时间轴的导出可用性判断也复用同一筛选。

## 2026-08-08：已有长 Smoke 不适合继续堆叠孤立场景

- 现象：字幕冲突 Smoke 已包含分页、筛选、定位、changed / added / removed、组合裁决、撤销重做和强制重载；继续把真实 reload 后的孤立译文断言塞入其中，会让失败位置和历史状态依赖更难定位。
- 经验：持续任务中的真实 UI 证据也应按行为边界拆分；新增持久化边界优先建立最小独立 Electron Smoke，同时保留旧 Smoke 作为回归，避免一条脚本承担互不相关的编排状态。
- 处理：新增 `smoke:editing-orphan-translation`，只验证译文保留、原文移除、页面 reload、孤立状态提示和控制台健康；旧 `smoke:editing-caption-reload` 单独回归通过。

## 2026-08-08：时间轴脚本文本与字幕块文本的空格格式不能混用

- 现象：Smoke 用“原始字幕 3”定位脚本行，但脚本面板渲染会压缩或移除文本空格，字幕时间轴块仍保留原文空格，导致业务状态已正确而断言超时。
- 经验：跨组件断言应按展示契约分别匹配：脚本行文本先归一化空白，字幕块文本保留可见文本匹配；不要因为 fixture 文本相同就假定 DOM 格式也相同。
- 处理：独立 Smoke 对脚本行使用空白归一化，对 caption 使用原始可见文本，并在失败时输出 caption / script 的 DOM 状态，便于区分断言问题和业务问题。

## 2026-08-08：恢复脚本段不能覆盖已保留译文的编辑

- 现象：孤立译文在原文删除期间仍允许用户调整时间；恢复脚本段时，如果直接按 `segment.translationText` 重新生成 translation caption，会丢失用户调整后的时间、文本和真实 loader ID。
- 经验：恢复动作应区分“重新物化缺失的原文”和“重新关联已有的译文实体”。已有译文的内容与时间属于用户编辑，不能因为脚本段恢复而被快照覆盖；真实 loader 的 `source-*` 前缀也不能用精确 ID 比较替代。
- 处理：新增共享脚本段 ID 等价 helper 和纯函数 `restoreEditingScriptSegmentCaptions`；恢复时只重建 source caption，优先复用按兼容 ID 找到的 translation caption，无已有译文时才按脚本快照创建，并用单测覆盖手动时间、文本与无译文两条路径。

## 2026-08-08：字幕 Smoke 的微调必须避开时间吸附阈值

- 现象：孤立译文位于整秒边界时，Smoke 使用普通右箭头执行 0.1 秒微调，但时间线吸附逻辑会把结果吸回整秒，测试一直等不到位置变化。
- 经验：真实 UI Smoke 应选择明确跨过吸附阈值的操作，并把“发生了用户可见位置变化”作为断言；不能只依赖默认步长碰巧脱离吸附点。
- 处理：Smoke 改用 `Shift+ArrowRight` 的 1 秒步进，验证译文位置先变化，恢复后仍保持变化后位置；同时记录前后截图和 `consoleErrors`。

## 2026-08-09：多段切口恢复不能把字幕拉成一条连续长块

- 现象：同一源素材可能在编辑时间轴中被重复插入；如果恢复脚本段只取第一个可见区间的开始和最后一个可见区间的结束，会把中间的其他画面错误覆盖进字幕范围。
- 经验：源时间范围映射到编辑时间轴后必须保留每个可见区间的边界；恢复、删除和后续导出都应识别这些派生片段，而不能只依赖原始 caption ID。
- 处理：恢复函数按 `sourceRangeToEditedRanges` 为每个区间生成稳定的 `-1`、`-2` 片段 ID，统一关系判断按兼容 ID 与源锚点识别；已有手动调整译文仍保持单实体原样复用。

## 2026-08-09：仅译文导出不能复用 source-led 的字幕 fallback

- 现象：孤立译文已经允许在工程内编辑，但直接把它接入现有 external subtitle 流程会在没有 source caption 时误用原始 sidecar，导出的 SRT 既不是用户看到的译文轨，也可能重新带入已删除原文的上下文。
- 经验：新增字幕轨导出必须显式声明轨道和可用性；source / translation 的 fallback 规则不能互相借用，孤立译文也不能因为“有文本”就获得导出资格。
- 处理：增加时间线专属 `translation-subtitle` 模式，序列化时显式选择 `translation`，只允许活动译文启用；普通剪辑仍使用 `ClipExportMode`，避免编辑器专属模式污染基础剪辑设置。

## 2026-08-09：多段字幕片段不能只按精确 ID 维护生命周期

- 现象：同一脚本段在时间轴中有两个不连续可见区间时，重排每个 caption 都会重新映射到全部区间，导致片段数量翻倍、派生 ID 冲突；重开或刷新 sidecar 时，`segment-1` 又会被当作 removed，真实 loader 的 translation ID 还可能被重复回灌。
- 经验：派生字幕需要持久化“所属脚本段 + 片段索引”，重排和 sidecar diff 必须先识别片段族群，再决定是重定位、更新还是删除；loader ID 的前缀差异不能用精确字符串比较替代。
- 处理：`EditingCaption` 增加 `editedRangeGroupId` / `editedRangeIndex`；重排按自身索引映射，旧版无元数据的 `-数字` ID 通过脚本段关系兼容推导；重载 preview 将族群视为一条差异，接受更新时保留片段的成片位置和实体 ID；caption effect 按脚本段关系去重 sidecar 回灌。
- 验证：核心 / UI 定向回归 54 项通过，`bun run typecheck`、`bun run build` 通过；独立真实 Electron Smoke 覆盖恢复 2+2、重排后 2+2、重开无误报、sidecar changed 2 / removed 0、双轨接受更新和 `consoleErrors:[]`。
- 提交边界：核心关系修正 `d7b1f87`，sidecar 回灌去重修正 `019abdd`，独立 Electron Smoke `dc935b8`；本条工程记录另行提交，内部计划继续 ignored。

## 2026-08-09：fragment 元数据和 force reload 必须同时闭环

- 现象：fragment 元数据只在 localStorage / 运行时对象中存在时，导出工程文件再导入会丢失 group / index；force reload 如果从已物化的 captions 直接 merge script，又会把一个脚本句子重建成多个 fragment 脚本行。
- 经验：新增持久化字段必须同时覆盖工程文件 parser、serializer 的 round-trip 和非法半结构校验；重载动作要区分“显示轨道的 materialized fragments”和“脚本层的 canonical sidecar cue”，不能用同一个数组承担两个层级。

## 2026-08-09：fragment family 的 removed diff 也必须聚合

- 现象：changed preview 已经把同一脚本段的多个 materialized fragment 聚合成一条差异，但 removed preview 仍逐个遍历 caption；同一 source / translation family 会展示成四条 removed，用户需要重复裁决，source remove + translation keep 也可能只处理族群中的一个实体。
- 经验：sidecar diff 的粒度必须在 added、changed、removed 三条路径保持一致；materialized fragment 是显示实体，不是独立的 sidecar cue。removed 代表当前族群的 canonical representative，实际删除动作再展开到整个 family。
- 处理：`buildEditingSubtitleReloadPreview` 为未匹配的当前 caption 按 family 去重并选择 index 0 作为代表；`applyEditingSubtitleReloadRemoval` 按脚本段关系和 fragment metadata 删除完整 source / translation family，并用已解析的 script segment 关系识别已保留译文。单测和 Fragment Reload Electron Smoke 覆盖 removed 2 行、原文族群全删、译文族群全保留和 reload 持久化。
- 处理：project file parser 校验并恢复 `editedRangeGroupId` / `editedRangeIndex`；force reload 继续使用现有 fragment family 保留成片位置，再以 incoming sidecar cues 重建 scriptSegments，确保一条 source cue 对应一条 canonical script row。

## 2026-08-09：跨媒体替换不能复用旧素材的 script identity

- 现象：替换时间线片段素材时，caption 会被重新锚定到新 `sourceId`，但旧素材的 script segment 可能继续保留相同 ID、时间范围和 `deleted` 状态；如果关联只比较 ID，新的 translation 会被误判为旧素材的孤立译文，fragment family 也可能跨素材合并。
- 经验：ID 是兼容 loader 的辅助身份，不足以跨媒体证明归属；当 caption 与 script segment 都有 `sourceId` 时，ID、源时间范围和 fragment group 都必须在同一素材上下文内解释。旧工程缺失 sourceId 时才允许降级到 ID 兼容匹配。
- 处理：`isEditingScriptSegmentCaption`、subtitle reload family、orphan translation 和 removed script segment 查找统一增加 sourceId 隔离；新增真实 Electron Smoke，先验证旧素材 orphan，再拖拽第二素材替换片段，确认新 translation 的 orphan 标记和提示消失，reload 后 sourceId 关系仍保持，`consoleErrors` 为空。
- 验证：project file / subtitle reload 定向测试 44 项通过；`bun run typecheck`、`bun run build` 通过；Fragment Smoke 验证 force reload 后 source / translation 仍为 2+2、位置为 1/2、script segment 数为 1、冲突清除且 `consoleErrors:[]`。
- 提交边界：核心修正 `32591af`，回归测试 `ae029ef`，Smoke `81583e6`；本条工程记录另行提交，内部计划继续 ignored。

## 2026-08-09：跨媒体 sidecar reload 不能继续读取已替换素材

- 现象：时间线片段已经从旧素材替换到新素材，但旧媒体文件和旧 `.srt` / `.translated.srt` 仍然存在；caption effect 仍会遍历项目全部 `sources`，并把当前文件的优先字幕路径按 `sources[0]` 传入。旧 sidecar 可能因此参与新素材的冲突预览，甚至被用户点击 force reload 后重新写回工程。
- 经验：sidecar 的加载范围必须由“仍被时间线使用的 source”决定，不能由素材库是否保留决定；优先字幕路径也必须按真实媒体路径匹配，source 数组顺序在替换操作后并不等于当前播放素材。revision key 还要包含活动 source 集合，避免非活动旧素材的 mtime / revision 变化触发错误冲突。
- 处理：新增 `createEditingCaptionSources` 与 `createEditingCaptionSourceRevisionKey`，过滤非活动 source、按路径分配 preferred sidecar，并在非活动旧 source 场景忽略旧 revision；新增 loader 单测和跨媒体 Electron Smoke，修改旧 sidecar 后确认无冲突预览、无旧 sidecar 预览、sourceId 持久化正确且 `consoleErrors:[]`。
- 提交边界：核心 `2cb75da`，单测 `fe25da8`，Smoke `2985c89`；FEATURE / FailureExperience 单独提交，内部计划继续 ignored。

## 2026-08-09：多素材字幕 revision 必须使用 per-source manifest

- 现象：上一轮把活动 source 集合加入 reload key 后，只能知道“整体 key 变了”，无法判断多个活动素材中究竟是哪一个 source / translation sidecar 变化；同时将旧 source 从活动集合移除时，不能把它误判为当前 source 的 sidecar 删除。
- 经验：多素材 reload 的版本状态必须按 `sourceId` 和字幕轨道拆分持久化；比较时只遍历下一次仍活动的 source，活动 source 的 revision 从已知数字变成 `null` 才代表 sidecar 删除，旧 source 消失本身不是删除事件。
- 处理：新增 `captionSourceRevisions` 工程字段和 `media:get-file-revision` IPC；loader 返回字幕与 revision 快照，caption effect 按活动 source manifest 生成冲突、force reload 和显式接受后的新基线。工程文件 parser / serializer 对 manifest 做结构校验，避免半结构数据静默进入项目。
- 验证：字幕 loader、工程文件和时间线契约单测 37 项通过；`bun run typecheck`、`bun run build` 通过；真实 Electron Smoke 覆盖第二素材双轨更新与双轨删除，更新阶段只出现第二素材 2 条差异，删除阶段只出现 2 条 removed，force reload 后第一素材保持不变，`consoleErrors:[]`。
- 额外修正：首次实现把“当前 source 替换为没有 sidecar 的新素材”当成 sidecar 删除，造成无意义冲突；随后将“旧 source 被移出活动集合”和“同一活动 source revision 变为 null”分开判断，并用回归 Smoke 固化该边界。
- 提交边界：核心 `b736487`，单测 `6a4530a`，Smoke `6737fe0`；本条工程记录另行提交，内部计划继续 ignored。

## 2026-08-09：工程素材移动不能按数组顺序猜测

- 现象：`.aivproj` 只保存绝对素材路径，复制工程或移动媒体目录后，打开工程会在任何字幕 / 时间线恢复前直接失败；如果直接按 `sources` 数组位置把用户新选的文件塞回去，还可能把不同素材的片段和 sidecar 绑定错。
- 经验：素材重定位必须保留原 `sourceId`，候选文件至少同时校验文件名与时长；同名重复、无法唯一匹配或新文件短于已有片段源范围时必须拒绝自动修复，让用户重新选择，不能用选择顺序或“唯一剩余文件”静默猜测。
- 处理：新增 `matchEditingSourceRepairCandidates` 与 `relinkEditingProjectSources`；打开工程发现缺失素材时复用视频选择器，按 source ID 更新 path / name / fingerprint / 媒体尺寸，保留 clips、captions、scriptSegments 和 fragment 关系。路径修复后字幕 effect 重新读取新路径 sidecar，只有内容确有差异才进入冲突流程。
- 现象二：冲突 diff 原先只有 `id` 和轨道类型，多个素材的相同时间字幕难以解释，且按 ID 应用裁决存在跨 source 误命中的风险。
- 处理二：`EditingSubtitleReloadChange` 携带 `sourceId`；当前 / incoming / removed 的查找都优先校验 sourceId，冲突行显示素材文件名和路径 tooltip；冲突筛选只在 revision 或差异集合真正变化时重置，避免 undo/redo 的异步状态更新清空用户刚输入的筛选。
- 验证：素材修复与字幕来源定向测试 27 项通过；`bun run typecheck`、`bun run build` 通过；多素材 Smoke 更新 / 删除阶段均显示第二素材 2 条来源行、第一素材 0 条来源行，四个既有 Caption / Fragment / Orphan / Cross-Source Smoke 回归通过，均无 `consoleErrors`。
- 提交边界：核心 `39a265f`，来源 UI `9728c1f`，单测 `a186cfc`，Smoke `760c500`；本条工程记录另行提交，内部计划继续 ignored。

## 2026-08-09：工程文件应同时保存可迁移路径提示和显式版本基线动作

- 现象：只保存素材绝对路径时，工程文件随媒体目录移动后只能依赖用户重新选择；而路径修复或字幕旁车迁移后，如果没有明确的 manifest 重建入口，用户无法判断当前工程是否已经接受新的 source / translation revision。
- 经验：相对路径只能作为可验证提示，不能覆盖绝对路径或未经检查地猜测素材；字幕版本基线也必须是显式动作，且只更新 revision 元数据，不应把“重建 manifest”误当成“强制重载字幕内容”。
- 处理：`.aivproj` 保存时按工程目录写入可选 `relativePath`，打开时仅对存在的提示目标自动修复；编辑器工具栏新增 manifest 重建按钮，读取活动 source 的双轨 revision、清除已处理冲突状态并持久化更新时间。新增路径提示单测和真实 Multi-Source Revision Smoke。

## 2026-08-09：提交消息必须使用中文 Conventional Commit 格式

- 现象：持续任务中如果只顾功能实现而忽略提交规范，后续 review 和自动化日志会失去统一的类型、影响范围与中文摘要。
- 经验：每次提交都必须使用 `type(scope): 中文 subject`，`type` 只允许项目约定值，subject 控制在 50 个字符内；功能、测试、Smoke 和文档仍按边界拆分，不能用一条模糊消息覆盖所有变更。
- 处理：本轮新增提交统一使用 `feat(editing): ...`，提交前检查 staged diff、敏感内容和工作区边界；内部跟踪计划保持 ignored，不进入远程仓库。

## 2026-08-09：旁车候选不能因空文件或大小写命名误判

- 现象：跨设备复制工程后，同目录可能同时存在空的 `.SRT` 和有效的 `.VTT`，macOS / Windows 的大小写文件名也可能与候选字符串不同；如果 loader 只取第一个可读文件，空文件会阻断后续字幕，用户也无法解释实际挂载了哪个旁车。
- 经验：候选必须按明确优先级逐个解析，跳过空内容和无有效 cue 的文件；配置了目标语言时先尝试精确语言，再尝试文档化的通用 / 区域别名和扩展名大小写变体。实际选中路径与完整候选列表必须进入冲突详情，不能只依赖日志。
- 处理：loader 返回 source / translation 的 selectedPath 与 candidates，冲突 UI 提供可展开路径详情；新增 loader / UI 契约测试和独立 Electron Smoke，验证空 `.SRT` 回退有效 `.VTT`、`zh` 命中 `.zh-CN.VTT`、双轨冲突和 `consoleErrors:[]`。

## 2026-08-09：多份旁车候选要按内容区分歧义

- 现象：为了识别“多个候选均有效”而读取所有候选后，macOS 的大小写不敏感文件系统会让 `.vtt` / `.VTT` 两个候选字符串读到同一份字幕；如果直接按路径计数，会把同一内容误报为两份候选。
- 经验：候选路径列表和歧义判断要分开：路径列表保留完整规则证据，歧义数量只统计解析后内容不同的有效候选；当前仍按候选优先级选择第一份，不能因为存在第二份候选就静默覆盖用户工程。
- 处理：loader 返回去重后的 `validCandidatePaths`，按解析 cue 内容签名合并等价候选；UI 展示有效候选数量、当前选中序号和完整候选路径；单测与真实 Electron Smoke 固化两份不同译文触发一次提示、大小写别名不重复告警的边界。

## 2026-08-09：切换旁车必须同时更新路径、内容和版本基线

- 现象：如果候选切换只修改 UI 当前选中项，下一次 reload 会按旧 preferred path 重新选择；如果只更新 revision manifest，又会让工程显示旧字幕内容与新路径不一致，undo / redo 也无法恢复用户选择。
- 经验：切换旁车是一个完整工程变更，必须在同一动作中重新加载目标 source / translation、持久化 `captionSourcePaths`、更新 per-source revision manifest，并把新字幕内容纳入编辑历史；失败时不能写入半个 preferred path 或半个基线。
- 处理：新增 `EditingProject.captionSourcePaths` 的 schema 1 可选字段和严格 parser；冲突面板提供有效候选按钮，动作按 sourceId / kind 校验候选、重新加载并采用新字幕，保存一次 undo 快照；真实 Electron Smoke 覆盖切换、preferred path、revision、undo 和 redo。

## 2026-08-09：跨设备 preferred path 必须有相对提示和持久化回退

- 现象：只把用户选择的字幕绝对路径写进工程，复制 `.aivproj` 到另一台机器后，loader 虽然能尝试自动候选，但旧路径仍会留在工程；再次保存或重启后，失效选择会反复出现，用户无法确认实际挂载来源。
- 经验：媒体相对路径提示不能只覆盖视频文件，字幕 source / translation 也需要相对于工程文件目录的可验证 hint；hint 不可用时应清理 preferred path，但不能静默接受新字幕内容，内容变化仍必须进入冲突审阅。
- 处理：新增 `captionSourcePathHints` 可选字段，保存 / 打开 / 另存为时生成和解析相对字幕提示；loader 返回 preferred path 可用性并在失效时回退自动候选，hook 将清理结果同步写入 localStorage；冲突面板新增“恢复自动候选”，重新加载、更新 revision，并纳入 undo / redo。Smoke 覆盖清除动作、内容切换和历史恢复。

## 2026-08-09：跨平台路径提示不能依赖宿主机分隔符和隐式覆盖

- 现象：工程从 Windows 搬到 macOS 或反向复制时，相对提示可能包含另一平台的 `\\` 分隔符；文件名大小写不同也可能让已有路径看起来失效。另存为如果只依赖保存对话框默认行为，还可能让用户不清楚是否会覆盖现有工程。
- 经验：路径提示应先归一化两种分隔符，再逐段读取目录项并只接受唯一的大小写匹配；覆盖工程必须在写盘前使用独立的、可取消的确认对话框，不能把覆盖决定隐含在保存 API 选项里。
- 处理：工程与旁车 hint 共用 portable path resolver；主进程打开工程注入大小写恢复器，保存工程前展示多语言覆盖确认；增加真实临时目录解析测试、Windows 分隔符契约测试、IPC 源码契约测试，并用 `bun run build` 与 Electron Smoke 回归。

## 2026-08-09：素材修复不能只返回“文件不存在”

- 现象：工程素材移动后，匹配器虽然会拒绝数组顺序猜测，但打开工程失败时只显示“素材不存在”；即使成功重绑定，也只显示“已打开工程”，用户无法确认 source ID、旧文件名和新路径是否对应正确。
- 经验：人工修复是一个需要可审计结果的迁移动作。匹配结果必须保留未解决 source、歧义 source 和候选路径；成功状态也要显示每条映射，失败时不应把部分修复静默写入工程。
- 处理：扩展 `EditingSourceRepairMatch` 的 issue 摘要，renderer 状态按四语言格式化匹配 / 未解决 / 歧义结果；新增修复单测、四语言文案测试和 `smoke:editing-project-repair`，验证 source ID 保持、路径重绑定及 `consoleErrors:[]`。

## 2026-08-09：素材重定位不能沿用没有迁移证据的旧旁车路径

- 现象：source ID 会在人工素材修复时保持不变，但旧工程里的 `captionSourcePaths` 可能只有绝对路径、没有相对工程提示；如果直接保留，字幕 loader 会优先读取旧素材旁车，即使新素材文件名已经变化。
- 经验：旁车偏好必须和迁移证据绑定。存在非空 `captionSourcePathHints` 时可以保留用户明确选择；没有可迁移 hint 的固定路径不能静默跨素材复用，应清除后按新媒体路径重新生成候选。
- 处理：`relinkEditingProjectSources` 在 source 重绑定时按 sourceId 清理无 portable hint 的 source / translation 偏好，保留有相对 hint 的路径；工程状态显示清理数量，单测验证一条清除、一条保留，Smoke 验证旧 source 字幕路径变为 `null` 且控制台无错误。

## 2026-08-09：字幕候选摘要必须区分同内容别名和不同内容

- 现象：loader 为了避免 macOS 大小写不敏感文件系统的重复告警，会把解析内容相同的 `.vtt` / `.VTT` 合并；如果只保留合并后的代表路径，工程打开状态无法解释实际扫描过的路径；反过来如果按路径直接计数，又会把同一份字幕误报成歧义。
- 经验：候选路径证据、内容变体和人工决策是三个不同维度。应保留等价候选分组，使用不同内容的代表路径驱动切换按钮，并在状态与冲突面板中明确说明当前选中路径及两类候选。
- 处理：新增 `equivalentCandidateGroups` 与 `getEditingCaptionCandidateAudits`，四语言状态 / UI 文案分别说明内容相同别名和内容不同候选；真实 Electron Smoke 验证同内容分组、不同内容提示、候选切换、撤销 / 重做和 `consoleErrors:[]`。

## 2026-08-09：工程状态栏不能直接承载完整候选路径

- 现象：候选审计把每个绝对路径、等价别名和不同内容路径全部拼进工具栏状态字符串；在临时目录或深层工程目录下，状态栏只能显示被截断的长文本，还会挤压时间线工具栏，用户无法判断是否有更多证据。
- 经验：状态提示应分为“立即可读的短摘要”和“按需展开的完整证据”。短摘要使用当前文件名与数量，完整路径通过原生 `details / summary` 保留；折叠展示只改变信息密度，不能丢掉候选来源或人工确认边界。
- 处理：扩展 `EditingProjectStatus.details`，候选审计状态只把文件名级摘要写入 `message`，完整路径写入可展开详情；增加四语言详情标题、状态单测、时间线契约测试和真实 Electron Smoke，验证摘要不含临时目录、展开后包含完整路径且原有切换 / 撤销 / 重做不回归。

## 2026-08-09：多素材候选详情不能继续使用扁平列表

- 现象：把多份素材的原文、译文候选直接拼成一个详情列表后，用户能看到路径却无法快速判断每条路径属于哪个 source 或字幕轨；同名素材的候选尤其容易误选。
- 经验：字幕候选证据必须沿用 loader 的 `sourceId + kind` 归属边界，展示层至少按素材和原文 / 译文分组；分组只是信息组织，不应改变不同内容候选的人工确认和切换规则。
- 处理：将 `EditingProjectStatus.details` 改为带稳定 ID 的 groups，工具栏详情按素材 / 字幕轨渲染独立区块；单测和 Electron Smoke 验证原文、译文分组、完整路径、内容差异提示及候选切换链路。

## 2026-08-09：分组详情不能只改变视觉层级

- 现象：候选详情按素材 / 字幕轨分组后，如果仍把所有路径默认展开，多素材工程的滚动成本没有下降；如果用自定义按钮管理开合，又容易遗漏键盘焦点、状态同步和无障碍语义。
- 经验：信息密度控制应复用浏览器原生 `details / summary`，让每个分组拥有独立的开合状态；外层详情负责“是否查看完整证据”，内层详情负责“查看哪一组证据”，两层职责不能混用。
- 处理：把分组区块改为嵌套原生 `details`，Smoke 验证两组默认关闭、点击展开、Enter 键展开以及关闭一组不影响另一组；同时把 Smoke 对外层 summary 的定位收窄为直接子元素，避免嵌套 summary 引发严格匹配错误。

## 2026-08-09：候选详情开合状态不能混入工程持久化

- 现象：候选审计会在重建字幕版本清单、自动回退或重新扫描后刷新 `editingProjectStatus`；如果详情组件随普通状态消息一起卸载，用户刚展开的长路径证据会立即丢失；如果把开合字段写进 `EditingProject`，又会污染工程格式并影响跨设备迁移。
- 经验：临时 UI 状态应由独立 renderer 组件持有，并以工程 ID 作为组件边界：同一工程的 status prop 更新保留外层 / 分组 open 状态，切换工程或整页重载自然创建新会话；status 暂时为 null 时组件也要保持挂载，才能覆盖短暂的普通状态窗口。
- 处理：新增 `EditingProjectStatusView`，使用受控原生 `details` 保存会话内开合状态；Electron Smoke 通过“展开 → 重建字幕版本清单 → 等待候选状态刷新”验证状态保留，检查 localStorage 没有 UI 状态键，并验证整页 reload 后全部重置。

## 2026-08-09：跨会话 UI 偏好必须独立于工程数据并可安全降级

- 现象：会话内开合状态解决了候选审计刷新时的 UI 跳动，但如果直接把它写入 `EditingProject` 或 `.aivproj`，工程格式会被 UI 偏好污染；如果不做版本和异常处理，损坏的 localStorage 还可能阻断编辑器启动。
- 经验：跨会话 UI 状态应使用独立、版本化的 renderer 存储，以 `project.id` 隔离工程，只保存布尔值和稳定分组 ID；必须限制条目数量和 ID 长度，解析失败、版本不支持或存储 API 抛错时回退默认状态，不能把本机绝对路径带入偏好。
- 处理：新增 `aivplayer.editing-ui-preferences.v1`，采用 schema version 1 保存外层 / 分组 `open` 状态，限制最多 32 个工程和每个工程 32 个分组；单测覆盖坏 JSON、未知版本、类型清洗、边界裁剪和存储异常，Electron Smoke 覆盖同一 user-data 目录重启、整页 reload、工程隔离和 `containsSmokePath:false`。

## 2026-08-09：UI 偏好容量上限不能代替失效工程清理

- 现象：只限制 UI 偏好最多保留 32 个工程，无法清理用户已经删除、被本地工程索引淘汰或长期不再使用的工程 ID；如果直接按当前工程覆盖整个偏好对象，又会误删其他仍可恢复的工程状态。
- 经验：清理应以已有的本地工程索引作为白名单，只移除确定不存在的工程；当前正在打开的工程必须额外加入白名单，兼容新建工程和外部 `.aivproj` 刚打开、尚未完成本地索引写回的时间窗口。清理仍只能作用于独立 UI 偏好，不能修改工程文件。
- 处理：新增 `readEditingProjectIds` 和 `pruneEditingUiPreferences`，在候选状态组件初始化时读取 `editing-projects.v1`，保留本地工程 ID 与当前 `project.id`，清理其余 UI 偏好；存储不可用、索引损坏或偏好 JSON 异常时安全回退。单测覆盖有效 / 非法索引、孤儿偏好、当前工程保护和存储异常，Electron Smoke 验证 `staleProjectPresent:false`、`currentProjectPresent:true`、无路径泄露且重启 / reload / 候选操作不回归。

## 2026-08-09：恢复默认 UI 偏好必须和受控 details 状态同步

- 现象：恢复默认同时修改 localStorage 和受控 `details` 状态；若跳过下一次写入，原生 `toggle` 事件可能让 React state / DOM 不一致，或点击后又把旧状态写回。
- 经验：恢复默认语义应明确为当前工程 `detailsOpen=false`、`openGroups={}` 并持久化该默认值；只重置当前 `projectId`，其他工程偏好必须保留。恢复后继续允许普通 `onToggle` 写入，避免事件竞态。
- 处理：新增 `resetEditingUiProjectPreferences`，候选详情旁新增可访问按钮与四语言 label；Smoke 验证当前外层 / 分组关闭、当前偏好为默认、其他工程偏好仍为 true，并继续验证重启、reload、候选切换、撤销 / 重做链路。

## 2026-08-09：全量 UI 偏好恢复必须先确认并验证取消分支

- 现象：全量清除候选详情偏好会同时影响多个工程，直接点击就执行容易造成用户误操作；只验证确认后的清空结果，还可能遗漏“取消后状态被意外折叠或旧偏好被改写”的回归。
- 经验：跨工程的 renderer UI 偏好清理必须使用本地化确认提示；取消时 DOM 和存储都保持原值，确认时才清空全部工程记录，并把当前工程的受控 `details` 状态同步为关闭，避免旧状态在 effect 中回写。
- 处理：新增 `resetAllEditingUiPreferences` 与“恢复所有候选详情默认”入口；四语言确认文案覆盖，真实 Electron Smoke 先 dismiss 再 accept，分别验证当前外层 / 分组、当前偏好、其他工程偏好和 `consoleErrors:[]`，随后继续验证重启、reload、候选切换、撤销 / 重做链路。

## 2026-08-09：字幕清单重建不能依赖 revision 键变化来清除候选状态

- 现象：候选审计只在字幕 effect 的依赖变化时重新计算；当用户移走重复旁车但选中的字幕文件 revision 没变时，重建字幕版本清单仍可能留下旧的候选详情。macOS 大小写不敏感时，单独移走 `.VTT` 还会被 `.vtt` 别名重新读到，容易误判 Smoke 没有覆盖清理分支。
- 经验：状态清理必须绑定触发动作本身，而不是假设依赖键一定变化；候选状态要有明确来源标记，清理时只删除该来源，不能把项目保存、媒体添加等普通状态一起清掉。跨平台 Smoke 还要同时考虑大小写别名，必须让全部有效候选暂时不可读后再验证无候选状态。
- 处理：为 `EditingProjectStatus` 增加候选来源标记和安全合并函数；字幕版本清单重建直接使用本次快照的 `sourcePaths` 计算候选状态，无候选时显示普通重建成功提示；Smoke 临时移走全部有效 source / translation sidecar，验证 `candidateAuditClearedDetailsCount:0`、恢复后详情重新出现且 `consoleErrors:[]`。

## 2026-08-09：许可证不能只写在 package.json 里

- 现象：`package.json` 虽然声明了 MIT，README 和网页也链接到 `LICENSE`，但仓库实际没有根许可证文件；Electron 打包配置也没有把项目许可证或第三方依赖清单带进安装包，发布工作流无法证明每个平台使用的是同一套许可证信息。
- 经验：许可证必须形成“项目声明 → 依赖版本 / 许可证 → 安装包资源 → CI 阻断检查”的证据链。npm 直接依赖可以自动核对，但 FFmpeg 的 GPL 选项、libheif codec、模型 revision 等构建期组件不能用一个静态 MIT / LGPL 标签代替，必须保留未完成项并在发布前按实际构建参数复核。
- 处理：新增根 `LICENSE`、`docs/THIRD_PARTY_LICENSES.md` 和 `npm run check:licenses`；Electron Builder 将许可证文件复制到资源目录，`release:check-packaged-resources` 强制检查，三平台 release job 在打包前执行清单校验；OpenList / VLC / Pireel 仅作为研究参考，不作为 AIVPlayer 代码或资源依赖。

## 2026-08-09：忽略目录中的模型不能假设 CI 已经拥有

- 现象：`resources/vision` 被 `.gitignore` 忽略，开发机上虽然有 758 MB 的 SigLIP2 UINT8 模型，但三平台 release workflow 没有下载步骤；electron-builder 的 `extraResources` 因此无法保证新 Runner 上视觉搜索可用。
- 经验：任何被忽略但被 `extraResources` 引用的资源，都必须有固定来源、revision、原子暂存脚本和打包前检查；只在本机验证一次不能证明 CI 能重建。
- 处理：新增 `release:prepare-vision-model`，固定 `onnx-community/siglip2-base-patch16-224-ONNX` revision；`release:write-runtime-metadata` 记录九个随包模型文件及运行时二进制的哈希，`release:check-packaged-resources` 强制要求元数据随安装包存在。

## 2026-08-09：发布渠道不能各自重新扫描发布物

- 现象：原流程由 GitHub Release 使用一组 glob 上传产物，镜像脚本再按扩展名递归扫描；两边没有共享文件集合、大小和内容指纹，发布过程中如果产物被替换或漏传，单靠文件名无法发现。
- 经验：多渠道发布必须先在合并后的唯一工作目录生成不可循环引用的 manifest，再让每个渠道复用并验证它；manifest 自身可以上传，但不能把自身哈希写入自身内容。
- 处理：新增统一 artifact policy 和 `release-manifest.json`；发布 job 生成并校验清单，渠道上传前逐个比较文件集合、大小和 SHA-256，漂移时在任何 API 写操作前失败。

## 2026-08-09：发布成功不能只代表上传请求成功

- 现象：上传接口返回成功，只能证明服务端接受了请求，不能证明最终 Release 中的每个安装包、更新元数据和 manifest 都可下载，也不能发现 CDN / 服务端存储中的内容漂移。
- 经验：发布后的验证必须走独立的只读链路：先用 GitHub API 获取 tag 对应的实际资产，再对每个下载响应流式计算大小和 SHA-256；manifest 自身不把自身哈希写入清单，因此需要额外比较本地与远端 manifest 的内容。
- 处理：新增 `release:verify-remote` 和 `verify-remote-release.mjs`；GitHub Release 创建后执行回读校验，生成不含 token 的报告 artifact。脚本只发起 GET 请求，不创建、删除或上传 Release 资源；单测使用注入的 fetch seam 验证 GitHub、远端篡改和无写操作边界。

## 2026-08-09：Release tag 和更新元数据必须先锁定版本

- 现象：只要 workflow 被 tag 触发，旧流程就会继续打包和上传；tag 可能与 `package.json` 版本不一致，`latest*.yml` 也可能残留旧版本或引用不存在 / 不属于当前批次的安装包。与此同时，electron-builder 生成的 `builder-debug.yml` 会被宽泛的 `*.yml` glob 一起带入发布物。
- 经验：发布版本必须在生成跨渠道 manifest 之前形成单一约束：tag 必须是 `v${package.json.version}`；所有 updater metadata 的版本必须一致，引用的 `url` / `path` 必须落在当前 artifact 集合；更新元数据只允许明确的 `latest*.yml` 命名，不能把任意 YAML 当作用户下载资产。
- 处理：新增 `release:check-version`；publish job 在生成 manifest 前执行 tag / package / metadata 校验，artifact policy 与三平台 glob 收紧到 `latest*.yml`，并补充调试文件排除、版本不匹配、引用缺失的单测。

## 2026-08-09：合并后的 manifest 不能证明每个平台都产出了安装包

- 现象：三个 build job 的 artifact 会在 publish job 合并；只要总目录里仍有一个平台的文件，旧流程就可能生成 manifest 并创建 Release，无法发现 macOS 缺 PKG、Windows 缺 EXE 或 Linux 缺 DEB 等平台级缺包。
- 经验：平台构建必须在自身 runner 上验证自己的输出契约，再进入跨平台合并：目标安装包扩展名、平台专属 `latest*.yml` 文件名和不允许出现的其他平台安装包都要明确列出；跨平台污染也应在上传前失败。
- 处理：新增 `release:check-platform` 与 `check-platform-release-artifacts.mjs`，分别接入 macOS / Windows / Linux 上传步骤；单测覆盖三平台完整集合、缺少目标包、跨平台包泄漏、调试 YAML 排除和未知平台。

## 2026-08-09：安装包文件名不是格式完整性的证据

- 现象：electron-builder 在多目标 macOS 打包过程中会先创建临时文件；如果只按扩展名或文件名扫描，零字节 PKG、未完成的 ZIP 或被错误重命名的文件可能进入上传目录。
- 经验：发布前至少读取每种安装包的轻量格式签名，并拒绝零字节文件：DMG 使用末尾 512 字节的 `koly`，ZIP / PKG 使用容器头，EXE 使用 `MZ`，AppImage 使用 ELF，DEB 使用 ar 头。格式检查不能替代平台契约、版本校验和安装 Smoke，但能截断最早的伪产物。
- 处理：新增 `release:check-formats` 与 `check-release-package-formats.mjs`，三平台 Upload artifacts 前执行；本机真实生成的 0.4.0 DMG 已通过 `koly` 校验。第一次查看 electron-builder 输出时只拿到会话中间日志，误把仍在运行的 ZIP / PKG 临时状态当成失败；改为轮询长期会话并检查退出码后，完整 `dmg + zip + pkg` 以 exit 0 完成，6 个真实 macOS 发布资产全部通过平台、格式、版本和 manifest 校验。

## 2026-08-09：Runner 日志不能代替可下载的构建证据

- 现象：平台检查只把文件数量和成功消息打印到 CI 日志；日志滚动、job 结束或多人复核时，无法快速确认某个平台实际上传了哪些文件、大小是否异常、哈希是否与最终 manifest 一致。
- 经验：每个 Runner 应在上传前写出独立、无凭据的证据报告，至少包含平台契约、文件名、大小和 SHA-256；报告要和发布资产分开保存，避免把审计 JSON 意外上传到 Release 或被 updater 当成安装包。
- 处理：扩展 `release:check-platform` 支持 `--report-path`，三平台分别上传 `release-evidence-macos/windows/linux` workflow artifact；报告文件名不符合 release artifact policy，不进入 GitHub 发布物和 manifest，但可在 Actions 中下载复核。

## 2026-08-09：保存 evidence 报告后还必须校验合并目录

- 现象：三份 Runner 报告即使各自正确，`actions/download-artifact` 合并到 publish job 后仍可能发生文件缺失、同名覆盖、哈希漂移或额外文件混入；如果直接生成总 manifest，最终清单无法证明它来自三份报告对应的文件。
- 经验：证据报告不是装饰性日志，必须成为 publish 前的输入约束：报告集合固定、平台契约固定、各报告之间不能重叠，报告联合文件集合必须与合并目录完全相等，最后逐文件复算大小和 SHA-256。
- 处理：新增 `release:check-evidence` 和 `check-platform-evidence.mjs`，在 `release:check-version` / `release:create-manifest` 之前执行；单测覆盖成功合并、报告缺失、文件哈希变化、报告重叠和未报告额外文件。

## 2026-08-09：发布清单还需要记录可验证的 CI 来源

- 现象：`release-manifest.json` 只有 tag、生成时间和文件哈希时，能证明“发布了什么”，但不能快速回答“哪次提交、哪个 workflow、哪次运行生成了它”；把完整环境变量写入清单又可能泄露 token、代理或本机路径。
- 经验：provenance 只能使用固定白名单的 CI 标识，并在写入前校验格式；来源信息应作为审计字段，不改变安装包、更新 metadata 和远端回读的文件集合。
- 处理：manifest 增加可选 provenance，读取 `GITHUB_SHA`、`GITHUB_REPOSITORY`、`GITHUB_WORKFLOW`、`GITHUB_RUN_ID` 和 `GITHUB_RUN_ATTEMPT`；本地无 CI 环境时不伪造值，CLI 只接受显式的同格式参数，单测覆盖 CI 来源写入和非法值拒绝。

## 2026-08-09：发布 dry-run 不能把三平台文件混在 Runner 门禁前

- 现象：第一次本地演练把 macOS、Windows、Linux fixture 直接放在同一目录，再逐个平台执行契约检查；脚本正确拒绝了其他平台包，暴露出这种拓扑与真实 CI 不一致。
- 经验：平台契约和格式检查必须在各自 Runner 暂存目录执行，之后才复制到 publish 合并目录；合并目录只交给 evidence、版本和 manifest 门禁，不能用放宽契约的方式掩盖跨平台泄漏。
- 处理：`release:dry-run` 改为分平台暂存、分别生成 report 并通过格式签名检查，再合并 9 个小型资产到根目录，执行三份 evidence 交叉校验、版本检查、manifest 生成和哈希复核；默认不调用远端脚本、不联网并清理临时目录。

## 2026-08-09：真实三平台验证需要独立于发布写操作

- 现象：本地 dry-run 只能验证编排，无法证明 Windows / Linux Runner 的真实 electron-builder 产物；直接用 workflow_dispatch 触发原发布流程又会创建 GitHub Release，增加误发布风险。
- 经验：真实 CI preflight 应复用同一套构建和发布前门禁，但把 GitHub Release 和远端回读作为明确条件保护的写操作；不能为了演练复制另一套校验流程。
- 处理：workflow_dispatch 新增布尔 `verify_only` 输入；该模式仍下载合并三平台 artifact 并执行 evidence、版本和 manifest 检查，只跳过 GitHub Release 创建和 GitHub 远端校验。push tag 的既有发布行为保持不变。

## 2026-08-09：合并 evidence 不能只存在于 publish 日志

- 现象：publish job 重新计算了三平台文件哈希，但如果只打印成功消息，workflow 结束后仍缺少一份能和最终 manifest 对照的合并目录证据；单独保存 Runner report 也无法直接证明合并目录当时的实际状态。
- 经验：合并校验应原子写出独立 JSON，记录最终目录实际文件的名称、大小和 SHA-256，并与安装包发布边界隔离；失败路径使用 `always()` 尝试保留已有报告，但不能因此放宽门禁。
- 处理：`release:check-evidence` 新增 `--report-path`，publish job 上传 `release-evidence-merged`；报告不进入 `release-manifest.json` 或 GitHub Release，单测覆盖成功报告内容、哈希格式和 workflow 上传步骤。

## 2026-08-09：目录 watcher 单测不能依赖宿主文件监听额度

- 现象：直接用宿主机 `fs.watch` 做单元测试时，macOS 测试环境可能因为已有 watcher 数量或系统文件描述符额度返回 `EMFILE`；这会把测试环境资源问题误报成旁车监听逻辑失败。
- 经验：目录监听核心应注入 `watchDirectory` seam，单测用可控的模拟事件验证候选路径过滤、去抖和 stop 生命周期；真实 `fs.watch` 只保留在桌面运行时，并让目录消失 / watcher error 不阻断播放器。
- 处理：字幕 watcher 核心增加可注入 watcher 工厂，定向单测改为模拟 rename / change 事件；Electron Smoke 继续作为真实宿主权限下的补充证据，不把宿主文件监听额度当作单元测试前置条件。

## 2026-08-09：push 前审计必须先拒绝脏工作区

- 现象：如果 push readiness 只检查提交内容而忽略当前工作区，未提交的内部计划、临时配置或敏感文件可能被开发者误以为已经纳入审计；在测试代码尚未提交时直接运行成功路径，也会错误地把脏工作区当成可推送状态。
- 经验：推送前门必须先检查 `git status --porcelain`，再检查相对基准的 diff、提交格式和敏感模式；成功路径应在真正干净的工作区运行，单测不应通过放宽 guard 来绕过这一前置条件。
- 处理：新增 `release:check-push`，固定拒绝脏工作区、禁止 `OPEN_SOURCE_INSPIRATION_PLAN.md` 进入变更范围，并保证脚本自身没有 `git push` / workflow 写操作；当前工作区清理并提交测试后再执行成功路径。

## 2026-08-09：远端回读不能只过滤“像发布物”的额外附件

- 现象：原 verifier 只把符合 artifact policy 的额外资产列为 unexpected，`builder-debug.yml` 或其他非发布文件可能残留在 Release 里而不触发失败；下载失败时的原始 URL 还可能把 query token 带入报告 message。
- 经验：远端附件集合必须与本地 manifest 完全相等，远端服务返回的任何附件都不能被静默忽略；所有写入报告或错误文本的 URL 都必须先去掉 query 和 fragment。
- 处理：远端回读改为拒绝所有 manifest 外附件，缺失名称 / 下载 URL 也直接失败；API 和资产下载错误统一经过 URL 脱敏，单测覆盖调试 YAML 额外附件和 `?token=...#...` 报告脱敏。

## 2026-08-09：Chocolatey 网络失败不能靠退出码判断 FFmpeg 已安装

- 现象：Windows Runner 的 Chocolatey feed 返回 HTTP 504 后，命令输出“installed 0/0”，但步骤没有立即阻断；后续固定扫描 `lib\ffmpeg` 找不到真实 `ffmpeg.exe`，导致 whisper.cpp 虽已编译成功仍无法进入打包。
- 经验：外部包管理器的成功条件必须是实际运行时文件和配套文件存在，不能只看命令退出码或 PATH 中的 shim；网络下载步骤需要有上限重试和指数退避，并在最终失败时给出明确路径。
- 处理：Windows x64 安装步骤最多重试 3 次、每次检查 Chocolatey `lib` 下真实 `ffmpeg.exe`；构建步骤从整个 Chocolatey `lib` 树定位二进制，再校验同目录 `ffprobe.exe`，避免依赖固定包目录布局。

## 2026-08-09：发布汇总不能递归扫描解包运行时

- 现象：旧版 publish job 直接递归扫描 `actions/download-artifact` 的总目录；Windows / Linux 的解包目录中包含 `AIVPlayer.exe`、FFmpeg、libheif 和 whisper-cli 等文件，证据报告会把它们误当成应上传到 Release 根目录的资产，最终在创建 Release 前报文件集合不一致。
- 经验：发布资产 policy 的递归能力应保留给需要处理历史目录的本地工具，但汇总安装包和合并 evidence 必须明确只读取上传根目录；“文件名匹配扩展名”不能替代构建产物拓扑边界。
- 处理：为 `listReleaseArtifacts` 增加 `recursive: false` 选项，汇总组装和合并 evidence 均显式使用根目录扫描；回归测试加入嵌套 `win-unpacked` / `linux-unpacked` 运行时，确认它们不会进入最终资产集合。

## 2026-08-09：多架构 Runner evidence 不能直接当作单平台报告

- 现象：publish job 的汇总目录同时包含 macOS、Windows 和 Linux 的安装包；把这个目录分别交给三次单平台契约检查，会把其他平台的合法资产报告为 `unexpected packages`，导致 0.5.0 在发布前失败，GitHub Release 因此不会创建。
- 经验：构建 Runner 的架构报告与最终发布平台报告不是同一个拓扑。Windows / Linux 的架构报告必须先合并，且合并后的更新元数据内容已经变化，不能沿用任一 Runner 报告中的旧哈希。
- 处理：汇总安装包和更新元数据后，从五份 Runner 报告保留包文件证据，重新计算最终 `latest*.yml` 的大小与 SHA-256，写出三份标准平台报告；publish job 只执行合并目录的格式检查和三平台 evidence 交叉校验。

## 2026-08-09：Windows updater metadata 与安装包文件名必须同源

- 现象：0.5.0 最近一次发布的五个平台构建均成功，但 publish job 的 `release:check-version` 报告 `latest.yml` 引用了 `AIVPlayer-Setup-0.5.0-x64.exe`，合并目录中不存在对应文件；因此 GitHub Release 和远端回读都被跳过，重复重试还会重新消耗整轮跨平台构建时间。
- 经验：Windows 安装包的实际 artifact 文件名、`latest.yml` 的 `url/path` 和最终汇总目录必须从同一个命名契约生成；不能只在文件上传前检查扩展名，也不能让 metadata 引用一个经过连字符归一化但实际文件仍是空格命名的文件。
- 处理：当前先保留版本校验作为发布门禁，不绕过错误创建 Release；后续修复应统一 electron-builder artifactName 与 updater metadata 引用，并在本地 assembly fixture、Windows Runner 和 `release:check-version` 三层同时验证空格 / 连字符命名一致性。

## 2026-08-09：Windows artifactName 必须与 updater metadata 同源

- 现象：上一轮五个平台构建全部成功，但 publish job 在版本门禁阶段发现 `latest.yml` 引用 `AIVPlayer-Setup-0.5.0-x64.exe`，实际汇总目录却是带空格的 `AIVPlayer Setup 0.5.0 x64.exe`，导致 GitHub Release 被跳过。
- 经验：Windows 安装包文件名不能只满足扩展名和架构检查；electron-builder 的 `artifactName` 必须直接采用 updater metadata 的 URL 命名语义，版本校验还要覆盖真实的连字符文件名。
- 处理：将 Windows `artifactName` 改为 `${productName}-Setup-${version}-${arch}.${ext}`，补充 release workflow 配置断言和 `release:check-version` 连字符文件名回归测试；下一次先触发 verify-only，再正式创建 Release。

## 2026-08-09：本机 Unix socket 单测不能依赖当前沙盒权限

- 现象：直接在 Vitest 中启动 Node Unix socket server，默认测试沙盒返回 `listen EPERM`；把 socket 临时目录改到 `/private/tmp` 也不能改变该限制，宿主权限申请被安全策略拒绝。
- 经验：本机 IPC 的单元测试应覆盖协议、manifest、边界校验和调用接线；真实 socket / named pipe 的跨进程交换必须放在 Electron Smoke 或具备宿主权限的 CI 环境，不应为了让单测通过而关闭认证或改用不等价的网络监听。
- 处理：bridge 单测改为不监听 socket 的清单 / 协议契约校验，并把真实跨进程交换明确列为后续 Electron Smoke 证据；功能实现仍保留 Unix socket、Windows named pipe、token、消息大小限制和超时边界。

## 2026-08-09：收件箱入队不能只更新 UI 状态

- 现象：收件箱最初在 renderer 中先把条目标记为 `queued`，再直接调用视觉索引队列；索引队列没有向该条目返回完成 / 失败回调，重启后条目也无法区分处理中和已完成，最终会长期停在“已入队列”。
- 经验：跨进程任务状态必须由主进程拥有，并把阶段状态与最终状态一起持久化；UI 只能发起用户动作，不能自行拼接后续任务链。每个队列入口都要定义成功、失败、取消和重启恢复语义。
- 处理：新增收件箱处理器和 `queued → processing → ready/failed` 状态机，记录媒体探测、字幕 sidecar、视觉索引三个阶段；renderer 通过条目变更 IPC 接收最终状态，避免重复入队和状态漂移。

## 2026-08-09：同一个 LanceDB 索引不能由多个入口并发写入

- 现象：手动全库索引、自动视觉索引队列和收件箱处理器原本分别直接调用 `VisionLibrary.indexVideos`；用户在收件箱处理时点击全库索引，会让模型加载、缩略图目录和 LanceDB 写入缺少统一生命周期约束。
- 经验：共享数据库 / 模型资源的多个入口必须在主进程建立唯一调度边界，不能只依赖各入口自己的队列；取消语义也要覆盖当前任务和等待任务，否则“取消”后仍可能有后台写入。
- 处理：新增 `VisionIndexCoordinator`，三条索引路径统一串行运行；`VISION_INDEX_CANCEL` 同时清理自动队列、调度器等待项和当前运行项，处理器收到取消错误后回写可重试失败状态。

## 2026-08-09：正式素材库应读取索引事实而不是重新扫描媒体目录

- 现象：收件箱条目进入 `ready` 后，界面仍只有收件箱列表；如果为了展示正式库再扫描目录或重新推断缩略图，会出现已索引但收件箱过滤不到、缩略图与 LanceDB 不一致的问题。
- 经验：正式库展示应以视觉索引写入的 `video_sources` / `video_frames` 为权威，metadata / thumbnail / source path 必须来自同一份索引事实；打开素材则复用已有加载和 seek 流程，避免产生第二套缓存和状态。
- 处理：新增 `VISION_LIST_SOURCES` 和 `VisionLibrary.listSources()`，从 source row 与首帧 row 组装只读素材卡片；sources IPC 不修改索引、不重新扫描目录，缩略图继续经过已有路径安全校验。

## 2026-08-09：正式素材库元数据投影必须复用收件箱 sidecar

- 现象：视觉索引的 `video_sources` 只保存索引事实，收件箱的标签、收藏、备注、来源和项目 ID 另存在 manifest / sidecar；如果在 renderer 里按文件名拼接，重命名、同名文件或外部 sidecar 更新都会产生错误归属。
- 经验：跨模块 metadata projection 必须在主进程按规范化媒体路径完成，并在查询前刷新 sidecar；索引库只提供 source 事实，收件箱只提供用户元数据，未匹配时返回明确的 `null`。
- 处理：新增纯 `mergeVisionLibrarySourceMetadata`，由 sources IPC 先刷新 sidecar 再投影；视觉素材卡片展示收藏、标签、来源、项目和备注，但不写回视觉索引或覆盖原视频。

## 2026-08-09：统一任务中心不能替换原有模块事件

- 现象：字幕、视觉、OCR、短剧和收件箱各自已有面板监听；如果直接把原始事件改成新协议，旧面板会失去字段或取消状态，导致一次跨模块改造的回归面过大。
- 经验：统一任务中心应采用主进程 fan-out 适配层，保留原模块 IPC 作为事实来源；转换器必须是纯函数，单测验证状态映射、进度语义和任务 ID，渲染层只订阅统一事件。
- 处理：新增 `TaskCenterEvent`、task center adapters、全局 preload listener 和只读浮层；原有 ASR / batch / vision / evidence / drama / inbox 事件继续照常发送，任务中心只增加旁路广播。

## 2026-08-09：统一任务进度不能猜测百分比单位或泄露绝对路径

- 现象：ASR 的 `percent` 与下载器不同，实际已经是 0–1；若统一层再次除以 100，界面会长期显示接近 0%。同时把完整 `mediaPath` 作为任务详情发送到 renderer，会扩大本地路径暴露范围。
- 经验：每个上游协议在适配器中明确单位并用测试锁定；跨进程展示只保留用户可识别的文件名或目标 ID，完整路径继续留在主进程既有业务事件中。
- 处理：ASR 直接使用 0–1，视觉 / batch / inbox 各自转换到 0–1；任务中心事件仅携带 basename，定向测试覆盖 0.42 进度和路径脱敏。

## 2026-08-09：任务中心重启不能恢复过期的运行中状态

- 现象：如果把任务中心收到的所有事件都持久化，应用异常退出后下一次启动会把旧的 `running` 事件显示成仍在执行；如果完全不持久化，用户又看不到刚刚失败或取消的结果。
- 经验：任务中心是观察层，不拥有业务任务的恢复权；只保存完成、失败、取消终态，重启后的运行态必须由原模块重新发真实事件，不能由观察层猜测。
- 处理：新增 `TaskCenterStore`、终态历史 IPC 和原子 `task-center.json`；历史查询在 live listener 建立后合并，避免初始化请求覆盖刚到达的新事件。

## 2026-08-10：场景切点不能直接当作可搜索证据

- 现象：FFmpeg scene score 只返回切点；如果直接把切点写入证据表，结果没有明确结束时间，搜索命中也无法生成可靠的源时间选段。
- 经验：切点必须先和媒体时长组成有界区间，并按源文件指纹生成稳定 ID；重新生成场景证据时只替换 `scene` 类型，不能删除同一媒体的字幕、视觉、OCR 或实体派生证据。
- 处理：新增纯场景证据转换器，按相邻边界生成场景片段，使用最近视觉帧作为缩略图锚点；场景检测作为显式可选索引阶段接入现有视觉调度器和任务中心，普通索引 / 收件箱默认不增加整段 FFmpeg 解码。

## 2026-08-10：被 Renderer 复用的媒体解析模块不能直接引入 Node 运行时

- 现象：为复用场景检测解析函数，把 `child_process` / `util` 运行逻辑直接加入 Renderer 也会导入的纯模块；类型检查和 Node 单测通过，但 Vite 浏览器构建因 Node external stub 没有 `promisify` 导出而失败。
- 经验：共享给 Renderer 的媒体模块必须保持纯函数和浏览器可打包；FFmpeg、文件系统和进程调用应放在明确的 Desktop-only runtime 文件中，由主进程或核心桌面服务调用。
- 处理：拆分 `scene-detection.ts`（切点解析 / 过滤）与 `scene-detection-runtime.ts`（FFmpeg 执行），重新通过 `npm run typecheck` 和 `npm run build`，避免用单测通过掩盖浏览器 bundle 边界错误。

## 2026-08-10：零样本实体相似度不能伪装成人脸或身份识别置信度

- 现象：已有 SigLIP2 图像 / 文本向量可以快速支持标签检索，但向量点积不是经过校准的分类概率；如果把它直接展示为“识别置信度”或无限制写入所有标签，会造成搜索证据过度承诺和索引膨胀。
- 经验：实体层第一版应使用固定、可审计的标签目录，设置最低相似度和每帧 Top-K，证据记录模型版本但不把相似度冒充身份结论；人物身份、人脸聚类和说话人识别必须单独建模、单独授权和单独验证。
- 处理：新增可选 `entity-evidence` 阶段，固定 10 个双语标签、阈值和 Top-K；只写入超过阈值的 `entity` 行，重算时只替换同类型证据，普通索引 / 收件箱默认不启用。

## 2026-08-10：视觉索引失败不能只停留在瞬时进度事件

- 现象：视觉索引失败只通过 progress 和任务中心短暂显示；应用重启后用户不知道是哪个视频失败，也不能保证重试时继续使用原来的抽帧间隔和可选证据配置。
- 经验：任务中心是观察层，失败恢复需要独立的业务清单；失败记录要以规范化媒体路径稳定去重，保留错误、阶段、选项和重试次数，并用原子写入避免崩溃留下半份 JSON。
- 处理：新增 `VisionIndexFailureStore` 与 `vision-index-failures.json`，主进程在手动索引、自动队列和收件箱进度的错误 / 完成事件上记录或清理；重试通过既有 `VisionIndexQueue` 重新入队，取消不误记失败，任务中心不携带完整本地路径。

## 2026-08-10：实体目录批量操作不能逐条模拟提交

- 现象：标签目录只有逐条改名、隐藏和合并；如果 UI 为批量按钮循环调用单条 IPC，连续操作期间可能出现中间状态、重复写盘或部分成功，合并关系也容易在多个请求之间形成环。
- 经验：批量目录修改应在纯函数中一次完成校验和投影，再由一个原子存储动作落盘；模型证据只读，目录操作必须保留稳定 `labelId`，合并目标不能属于当前选择集。
- 处理：新增 `VisionEntityCatalogBatchPatch` 和批量更新 IPC；统一验证未知标签、自合并和非法目标，合法批量隐藏 / 显示 / 合并一次性持久化，Renderer 只提交一个批量请求。

## 2026-08-10：收件箱批量重试不能把中间状态暴露给用户

- 现象：收件箱的单条重试是“失败 / 忽略 / 缺失 → 待确认 → 入队”两步状态迁移；如果 UI 对多选项逐条调用旧 IPC，应用重启或 watcher 插入事件时可能只完成其中一部分，用户还会看到短暂的待确认残留。
- 经验：批量业务动作不能简单循环复用单条 IPC；应该在纯函数中先对整组选项做严格校验，再一次性替换内存快照并原子持久化，处理器只在提交成功后接收全部队列项。
- 处理：新增 `MediaImportInboxBatchAction` 和批量 transition IPC，统一实现 queue / ignore / retry；未知 ID、重复 ID、状态不适配时整批返回空结果，不写 manifest，Renderer 只在成功后清空选择。

## 2026-08-10：任务中心清除不能只修改 Renderer 内存

- 现象：任务中心的“清除已结束”按钮只过滤当前 React state；重新打开面板或重启应用后，`task-center.json` 中的完成 / 失败 / 取消历史又会被加载回来，用户会误以为清除失败。
- 经验：凡是 UI 文案表达“清除历史”，必须同步修改拥有持久化事实的主进程 Store；清理操作要与写盘完成建立顺序关系，不能先让 Renderer 假装成功。
- 处理：新增 `TASK_CENTER_CLEAR_FINISHED` IPC；`TaskCenterStore.clearFinished()` 清空终态快照并复用原子写入链，preload / Hook 仅在主进程调用成功后更新 Renderer，运行中事件仍由 live listener 保留。

## 2026-08-10：收件箱清理不能复用忽略或删除媒体语义

- 现象：收件箱条目积累后需要清理“已忽略 / 文件已消失”记录；如果直接复用状态迁移或删除路径逻辑，可能把 processing / ready 条目误删，甚至误删用户媒体或 sidecar。
- 经验：清理必须是单独的批量动作，纯函数先严格限制状态为 `ignored` / `missing`，Store 一次替换 manifest；动作只处理收件箱 JSON 记录，不触碰文件系统中的媒体、旁车和视觉索引。
- 处理：新增 `clear` 批量动作，IPC / Hook / UI 只在整批状态合法时提交；清理后重新读取 manifest 更新 Renderer，非法混选整批拒绝且不写盘。

## 2026-08-10：任务中心筛选分页不能伪装成历史清理

- 现象：任务中心的历史记录有固定加载上限；如果把“只显示当前页”或“按状态隐藏”实现成删除事件，用户切换筛选条件后会丢失观察记录，甚至可能误触发业务任务清理。
- 经验：筛选和分页必须是 Renderer 观察层的纯投影，不能修改 `TaskCenterStore`、任务状态、取消 / 重试语义或持久化文件；只有明确的“清除已结束”动作才能触碰终态历史。
- 处理：新增关键词 / 状态筛选和页码裁剪纯函数，界面保留原始事件集合并在本地计算可见项；搜索覆盖任务名、消息、当前文件和任务类型，分页边界由模型统一钳制并用单测锁定。

## 2026-08-10：批量重试视觉索引不能共享最后一次配置

- 现象：失败记录可能分别使用不同抽帧间隔、场景证据和实体证据选项；如果批量重试只是连续调用原有队列入口，队列上的全局配置会被最后一次调用覆盖，前面的任务可能用错索引选项。
- 经验：可恢复任务的配置必须和任务一起进入队列，而不是保存在队列的全局可变字段；批量重试要先原子更新全部重试计数，再按记录配置排队。
- 处理：失败模型新增批量重试纯函数和 Store 入口，IPC 一次校验 ID 后逐项提交；`VisionIndexQueue` 改为保存带 interval / options / progress callback 的 job，仍保持串行执行和路径去重，保证每条失败记录使用自己的配置。

## 2026-08-10：正式素材库筛选必须作用于已投影的只读事实

- 现象：素材库卡片同时包含视觉索引事实和收件箱 sidecar 元数据；如果筛选在 Renderer 里重新读目录、按文件名猜元数据归属，重命名、同名文件或 sidecar 外部更新都会导致搜索结果与卡片展示不一致。
- 经验：正式素材库应先由主进程刷新 sidecar 并按规范化媒体路径完成 metadata projection，再把完整的只读 source 投影交给一个纯筛选 / 排序函数；筛选条件可以覆盖标签、来源、项目和备注，但不能触发扫描、索引或原文件写入。
- 处理：新增 `filterVisionLibrarySources`，在 renderer 仅对 IPC 返回的 source 投影做搜索、收藏过滤和稳定排序；排序结果使用新数组，保留原始 source 列表和既有打开原视频链路。

## 2026-08-10：正式素材库不能把固定上限误当成完整库

- 现象：sources IPC 原先最多返回 100 条，界面没有告诉用户还有未加载素材；索引库超过上限后，搜索、收藏过滤和排序只在首批数据上执行，用户会误以为素材不存在。
- 经验：只读素材库需要把分页边界放在主进程数据读取层，并在稳定排序后再应用 offset；Renderer 通过“加载更多”逐页追加，不能把多个独立请求直接按返回顺序拼接而不去重。
- 处理：`VisionLibrary.listSources(limit, offset)` 按最近索引顺序切页，IPC 透传 offset，素材库按 100 条追加并按 source ID 去重；筛选仍只作用于已加载的只读集合，未改变索引和 sidecar 写入边界。

## 2026-08-10：持续开发时仍必须按功能边界拆分提交

- 现象：视觉索引、任务中心、短剧和发布流同时存在于工作区时，若为了“尽快完成”一次性暂存几十个文件，review 无法判断每个改动的目的，失败时也难以定位回滚范围。
- 经验：持续任务不能改变提交纪律；每完成一个独立层级就先做定向测试，只暂存相关文件、扫描 staged diff，再使用中文 `type(scope) : subject` 提交。宿主 Smoke、文档、样式和发布脚本也应与业务逻辑保持可辨识边界。
- 处理：本轮将运行时、IPC、Renderer、任务事件、短剧模板、发布 workflow、原生构建脚本、README 和接线测试拆成多个小提交；私有计划文件保持 ignored，重复 CSS 不追加入功能提交。

## 2026-08-10：Electron Smoke 不能把面板顺序和 Provider 注册值当成事实

- 现象：短剧媒体生成 Smoke 初版点击了最后一个面板标签，实际打开的是“信息”而不是“短剧”；随后又把注册时的 `http-json` 当成最终 Provider ID，忽略了服务响应可以返回 `smoke-image` 等实际 Provider 标识。
- 经验：Smoke 应根据真实 `PanelTabs` 顺序选择目标入口，并断言页面 / IPC 返回的最终状态；Provider 的注册配置、响应覆盖字段和任务持久化字段不能混为一谈。
- 处理：Smoke 改为点击短剧固定标签，使用本机临时 HTTP fixture 跑三类任务，按媒体类型校验响应 Provider、成本、结果文件、任务中心终态和重启恢复；fixture 在 `finally` 中关闭并清理用户目录。

## 2026-08-10：Electron Flatpak 不能直接复用桌面端预编译资源

- 现象：electron-builder 的 macOS / Windows / Linux 发布配置引用了工作区中被忽略的预编译 FFmpeg、whisper.cpp、libheif 和 SigLIP2 资源；这些资源只存在于当前开发机，不能作为 Flathub 的可重建输入。
- 经验：Flatpak 必须把 Electron BaseApp、Node SDK 扩展、离线 npm source、`--linux --dir --publish never` 和应用启动 wrapper 作为独立边界；原生运行时、原生 npm 依赖和大模型还要分别设计固定源码、构建命令、架构覆盖和许可证证据链。
- 处理：新增第一阶段 manifest、桌面入口、Metainfo、Electron-builder Flatpak 配置、离线源清单和静态检查；当前明确不宣称已满足 Flathub 提交条件，待 Linux 构建环境具备后继续补齐原生模块与模型安装方案。

## 2026-08-10：依赖源生成器遇到代理竞态时不能提交半成品

- 现象：`flatpak-node-generator` 在本机代理环境下可以处理大部分 npm 包，但在 Electron / esbuild 特殊扩展阶段长期不退出，过程中不会写出完整 JSON；直接把中途状态当作成功会留下不可复现的 Flatpak 源清单。
- 经验：外网下载前先检测代理；生成器必须以退出码和输出文件完整性为成功条件，不能只看进度条。遇到特殊包处理阻塞时，可以先用工具的 stub 模式生成基于锁文件完整性字段的第一阶段清单，但必须把 Electron BaseApp 缓存、平台二进制和真实构建验证记录为后续阻塞项。
- 处理：当前提交只把 stub 清单用于 manifest 静态接线和持续检查，不把它当作最终 Flathub 构建证据；后续在 Linux `flatpak-builder` 环境中重新生成并验证完整源清单，确认 Electron、esbuild 和所有原生模块的架构选择后再提交 Flathub。

## 2026-08-10：Flatpak 补丁不能直接复用异常 Git diff

- 现象：远程 Linux builder 构建 x265 时，补丁的修改内容能够部分应用，但由于补丁包含异常的 Git `index` 头并返回非零状态，`flatpak-builder` 将模块判定为失败。
- 经验：给 Flatpak manifest 使用的补丁应是可由标准 `patch` 直接消费的 unified diff；不能把本地生成、缺少有效新文件对象哈希的 Git diff 原样当作构建补丁。
- 处理：移除补丁中的 Git 元数据，只保留 `---` / `+++` 和完整上下文；提交前检查补丁格式，之后用远程 Linux CI 验证真实应用结果。

## 2026-08-10：Flatpak CMake 安装后不能重复复制旧路径

- 现象：whisper.cpp 的 CMake 安装阶段已经把 `whisper-cli` 放到 `/app/bin/whisper-cli`，manifest 仍在 `post-install` 中复制不存在的 `build/bin/whisper-cli`，导致远程 builder 在源码编译成功后失败。
- 经验：使用 `cmake-ninja` 的模块应以实际 `cmake --install` 结果为准；不能把旧版构建目录中的产物路径当成稳定接口重复安装。
- 处理：删除重复的 `post-install` 复制命令，保留 wrapper 对 `/app/bin/whisper-cli` 的显式引用，并在静态检查中禁止重新引入旧路径。

## 2026-08-10：Cargo 离线配置必须放在标准 .cargo 目录

- 现象：LanceDB 的 Cargo 源码清单已经包含 `ahash` crate，但远程 builder 仍在离线解析时报告 `no matching package named ahash found`。
- 经验：Cargo 只有在项目根目录的 `.cargo/config` 或 `.cargo/config.toml` 中才会读取 source replacement；把同名配置写到普通 `cargo/config` 不会启用 vendored source，构建会错误回退到 crates.io index。
- 处理：将 Flatpak inline source 的目标目录改为 `.cargo`，并在静态检查中锁定 `replace-with = "vendored-sources"` 与 `.cargo/config` 路径。

## 2026-08-10：Rust build script 的系统工具也必须进入 Flatpak manifest

- 现象：LanceDB 的 Cargo 依赖和源码 vendor 已经完整，Rust 编译继续到 `lance-encoding` 时仍因找不到 `protoc` 失败。
- 经验：Cargo 离线清单只覆盖 Rust crate，`prost-build` 等 build script 依赖的系统工具不会随 crate 自动提供；Flathub 构建环境不能假设宿主机装有 `protoc`。
- 处理：新增固定 protobuf v30.2 源码模块，在远程 builder 中安装 `/app/bin/protoc`，并通过 `PROTOC` 环境变量显式注入 LanceDB 模块；不使用本地预编译工具或宿主机 apt 状态。

## 2026-08-10：Flatpak npm 构建不能触发 ONNX Runtime CUDA 下载

- 现象：远程 builder 已经完成 FFmpeg、媒体库、whisper.cpp、protobuf 和 LanceDB 编译，但最终离线 `npm install` 运行 `onnxruntime-node` 的 postinstall 时访问 `api.nuget.org`，因网络不可用失败。
- 经验：`onnxruntime-node` 的 CPU 运行时文件随 npm 包提供，Linux x64 默认额外下载的是 CUDA 扩展；Flatpak 构建阶段必须明确禁止这类可选网络下载，且当前版与旧版使用的环境变量不同。
- 处理：在 Flatpak 应用模块同时设置 `ONNXRUNTIME_NODE_INSTALL=skip` 和 `ONNXRUNTIME_NODE_INSTALL_CUDA=skip`，保留 CPU 推理能力并兼容新旧安装脚本；不在本地编译 ONNX Runtime，也不把宿主机或 NuGet 二进制偷偷带入构建。

## 2026-08-10：Electron 打包阶段不能依赖隐式 GitHub 下载

- 现象：ONNX Runtime 已跳过 CUDA 下载，远程 builder 的 npm 安装和应用构建均成功；`electron-builder --linux --dir` 在准备 `linux-unpacked` 时仍通过 `@electron/get` 请求 `github.com` 下载 Electron Linux 包，Flatpak 沙箱因无网络报 `getaddrinfo EAI_AGAIN github.com`。
- 经验：Flatpak 的源码下载阶段和模块 build 阶段是两个边界；允许 manifest 下载并校验固定源，不等于允许构建命令临时联网。Electron BaseApp 不会自动满足 electron-builder 的本地发行目录输入，必须显式提供固定版本的 Electron 包。
- 处理：从 Electron 官方 v43.2.0 release 按架构固定 `electron-v43.2.0-linux-x64.zip` / `electron-v43.2.0-linux-arm64.zip` 和 SHA-256，作为 manifest archive source 解压到独立目录；Flatpak 专用 electron-builder 配置固定 `electronVersion` 并设置 `electronDist: ../electron-dist`，让远程构建直接使用对应架构的本地发行目录。

## 2026-08-10：Flatpak 图标尺寸不能只看目录名称

- 现象：远程 Flatpak 已完成所有源码模块、npm 安装、Vite 构建和 Electron 打包，导出 repo 时仍因 `512x512` 目录中的实际 PNG 是 `1024x1024`，被 `appstreamcli` 拒绝。
- 经验：Flatpak 图标的目录名称不是尺寸声明，导出器会读取 PNG 实际像素尺寸并限制最大 512；共享桌面品牌图标可以保持高分辨率，但 Flatpak 应该使用单独的发布资源。
- 处理：由原始品牌图标生成 `flatpak/icon-512.png`，manifest 改为安装该文件；静态检查读取 PNG header，锁定实际宽高不超过 512，避免再次把大图放入 Flatpak 导出目录。

## 2026-08-10：Flatpak CI 不能用当前源码掩盖固定 source 的缺文件

- 现象：CI 为了验证当前分支，会把 manifest 中的应用 git source 临时替换成本地 checkout，因此即使当前构建成功，也可能没有验证 Flathub 实际按固定 release tag 拉取的内容；本次 v0.5.0 tag 不包含后续加入的 Flatpak desktop、MetaInfo 和图标文件。
- 经验：最终 manifest 的应用 source 必须固定到一个包含全部构建输入的完整 commit；CI 的本地 source 替换只能作为加速当前分支验证，不能让它绕过 source 可重建性检查。
- 处理：把应用 source 固定到包含 Flatpak 元数据的完整 commit，CI 替换脚本同时支持 commit source，静态检查通过 `git cat-file` 确认该 commit 实际包含 desktop、MetaInfo、512 图标、Electron-builder 配置和启动 wrapper。

## 2026-08-10：Flatpak 离线 npm 构建不能放任 CLI 自己探测网络

- 现象：`npm install --offline` 主流程虽然能够完成，但 npm CLI 仍可能尝试请求 registry 查询更新或发送 audit / fund 请求；这类旁路请求会在 Flathub 无网络构建中留下竞态和误导性错误日志。
- 经验：离线构建不仅要给安装命令加 `--offline`，还要关闭 npm 的 audit、fund 和 update notifier；环境变量应由 manifest 固定，不能依赖 runner 或 SDK 的默认配置。
- 处理：在 Flatpak 应用模块加入 `NPM_CONFIG_AUDIT=false`、`NPM_CONFIG_FUND=false` 和 `NPM_CONFIG_UPDATE_NOTIFIER=false`，并在静态检查中锁定这三项。

## 2026-08-10：Flatpak AppStream 不能只验证能 compose

- 现象：AppStream 在导出阶段能够生成 catalog，并不代表 Flathub 的元数据检查已经满足；官方要求图形应用提供截图和 OARS 1.1 年龄评级，缺字段会在后续 lint / 审核阶段才暴露。
- 经验：desktop、MetaInfo、图标和截图应作为同一发布输入审计；截图资源必须来自固定 tag 或 commit，不能依赖本地临时文件或可变 branch。
- 处理：MetaInfo 加入品牌色、OARS 1.1、固定资源截图和英文 caption；静态检查锁定这些字段，后续将把截图 URL 从当前分支改为已提交的不可变 commit。
## 2026-08-10：shell 临时变量不能在同一命令右侧展开

- 现象：用 `files="$(rg ...)" npx vitest ... $files` 试图动态传入测试文件时，shell 会在执行前展开右侧的 `$files`，导致变量为空，意外跑了全仓测试并混入与本模块无关的失败。
- 经验：需要动态组装测试路径时，先由工具读取路径，再把明确的参数数组传给命令；若必须在 shell 中处理，应使用独立赋值后的下一条命令，并在输出中确认实际测试文件数量。
- 处理：本轮改为先读取 46 个 `vision-*` 测试路径，再显式传入 Vitest；视觉检索 46 个文件 / 131 项测试全部通过，未把全仓环境限制误判为视觉模块回归。

## 2026-08-10：编辑字幕词时序失配后不能放弃词级渲染

- 现象：移除静音会裁掉字幕词的部分时间片，但编辑字幕正文仍保持完整；Renderer 发现词序列与正文不一致后直接渲染整句文本，逐词高亮 Smoke 因此找不到 `.subtitle-word`。
- 经验：编辑操作可能改变词时间片而不改变可见正文；词级渲染必须先验证词序列覆盖正文，失配时生成当前正文的回退词序列，不能把“存在旧词数据”当作“词数据仍然有效”。
- 处理：共享层新增 `areSubtitleWordsCompatible`，编辑字幕预览在失配时调用 `createFallbackSubtitleWords`；长 Electron Smoke 已验证“移除静音 → 逐词高亮”生成 10 个词节点且有活动词。

## 2026-08-10：Electron Smoke 不能把异步提示文案当作持久化事实

- 现象：素材替换成功后，字幕候选异步审计会刷新工程状态栏；Smoke 等待“已替换为 second-source.mp4”或“素材时长不足”提示时可能超时，即使工程数据已经正确写入。
- 经验：Smoke 对编辑动作应等待可重读的工程快照、文件产物或 DOM 状态；异步诊断提示只作为观测值，不能代替业务状态断言。窗口外的确认按钮也不应依赖 Playwright 滚动到可视区。
- 处理：素材替换 Smoke 改为等待 localStorage 中的 clip / source 映射，并用字幕 source anchor 校验重映射；导出对话框取消改用 DOM click；长 Smoke 通过且 `consoleErrors:[]`。

## 2026-08-11：Flatpak 双架构输出目录不能写死为 linux-unpacked

- 现象：x86_64 构建完成，但 ARM64 在 Electron 打包后执行 `cp app/release/linux-unpacked/.` 失败；不同架构的 electron-builder 输出目录可能是 `linux-arm64-unpacked`。
- 经验：Flatpak manifest 不能把 electron-builder 的架构输出目录当成跨架构稳定接口，复制前必须按候选目录探测并用 `test -d` 阻断缺失输入。
- 处理：构建命令优先使用 `linux-unpacked`，不存在时回退到 `linux-arm64-unpacked`，然后再复制到 `/app/main`。

## 2026-08-11：Flathub 截图必须在构建时生成 media OSTree ref

- 现象：Flatpak 能完成构建和 AppStream compose，但 repo lint 报 `appstream-external-screenshot-url` 与 `appstream-screenshots-not-mirrored-in-ostree`；仅把截图 URL 固定到 Git commit 不能替代 Flathub media 镜像。
- 经验：带远程截图的 Flathub 构建必须使用 `--compose-url-policy=full --mirror-screenshots-url=https://dl.flathub.org/media`，让 AppStream 下载截图并把对应 media ref 写入 OSTree；之后必须同时跑 repo lint。
- 处理：x86_64 与 ARM64 Flatpak workflow 都加入截图镜像参数，保留固定 commit 截图 URL，避免通过放宽 linter 掩盖发布元数据缺失。

## 2026-08-11：发布流水线不能从包管理器动态获取 FFmpeg

- 现象：macOS Homebrew、Windows Chocolatey、Linux apt 获取的是构建当天的 FFmpeg，既无法保证版本一致，也可能因上游 latest 标签或 feed 竞态产生不同二进制。
- 经验：发布运行时必须把来源、版本、下载地址和 SHA-256 作为构建输入；平台预编译包可以固定不可变构建资产，macOS 则固定官方源码归档并在 Runner 上构建。
- 处理：统一锁定 FFmpeg 8.1.2 输入；Windows x64/ARM64 与 Linux x64/ARM64 使用固定 BtbN 构建及校验和，macOS 使用官方 `ffmpeg-8.1.2.tar.xz` 及校验和，不再调用 Chocolatey / apt / Homebrew 的 FFmpeg 包；Linux deb 同时移除显式的系统 `ffmpeg` 依赖，避免安装包再拉取一份动态最新版。

## 2026-08-11：Flathub 构建参数不能假设宿主 flatpak-builder 版本

- 现象：按 Flathub 文档加入截图镜像参数后，GitHub Runner 的宿主 `flatpak-builder` 直接报 `Unknown option --compose-url-policy=full`，两个架构都在真正构建前退出。
- 经验：Runner 的 apt 版 flatpak-builder 可能落后于 Flathub 文档要求；既然 workflow 已安装 `org.flatpak.Builder`，构建和 linter 必须统一使用这个持续更新的 Flathub Builder 容器。
- 处理：Flatpak 构建改为 `flatpak run --user org.flatpak.Builder`，保留截图镜像参数，避免宿主工具版本差异再次阻断构建。

## 2026-08-11：Flatpak CI 应使用 Flathub Builder wrapper

- 现象：CI 已经成功安装 `org.freedesktop.Sdk//25.08`，但直接启动 `org.flatpak.Builder` 仍报告 `Unable to find sdk org.freedesktop.Sdk version 25.08`；无论此前把依赖装到用户仓库还是系统仓库，都没有解决 SDK 查找范围不一致的问题。
- 经验：Flathub 的 `org.flatpak.Builder` 不是应该直接调用的宿主命令；官方 `flathub-build` wrapper 会设置 `FLATPAK_USER_DIR`，启用 `--user`，并通过 `--install-deps-from=flathub` 统一安装 manifest 声明的 SDK、扩展和 BaseApp。
- 处理：Flatpak CI 只安装用户级 `org.flatpak.Builder`，构建改为 `flatpak run --user --command=flathub-build org.flatpak.Builder flatpak/ci-manifest.yml`，linter 也固定从同一用户级 Builder 运行；不再手动混合系统 SDK 和 Builder 沙盒。

## 2026-08-12：Flatpak sandbox 不允许临时源码指向 manifest 目录外

- 现象：CI 用临时 `type: dir` source 指向 manifest 目录外的 `..`，Flathub Builder 在 sandbox 模式下拒绝构建：`File ... not inside manifest directory`。
- 经验：为当前分支验证源码时，临时源码也必须位于 manifest 目录内；不能用宿主 checkout 的相对路径绕过 Flatpak 的源码边界。
- 处理：CI 先用 `git archive` 将当前 checkout 解包到 `flatpak/ci-source`，临时 manifest 固定引用目录内的 `ci-source`；正式 Flathub manifest 仍使用不可变的应用 Git commit。

## 2026-08-13：Flatpak 截图镜像必须通过 Flathub Builder wrapper

- 现象：Flatpak 应用本体已经构建并导出成功，但仓库 lint 报 `appstream-external-screenshot-url` 和 `appstream-screenshots-not-mirrored-in-ostree`。
- 经验：截图镜像参数不能只记录在文档或历史配置里；必须由实际执行构建的 Builder 传入。Flathub 的 `flathub-build` wrapper 已固定包含 `--mirror-screenshots-url` 和 `--compose-url-policy`。
- 处理：CI 构建统一调用 `flatpak run --user --command=flathub-build org.flatpak.Builder`，避免宿主 `flatpak-builder` 漏掉 Flathub 专用截图镜像参数。
## 2026-08-11：Microsoft Store 包 URL 不能使用 GitHub Release 重定向

- 现象：把 `https://github.com/.../releases/download/.../*.exe` 填入 Partner Center 后，微软提示“包 URL 重定向到另一个 URL”，拒绝继续保存包信息。
- 经验：Microsoft Store 的 MSI/EXE 包 URL 必须是版本化 HTTPS 直链，不能依赖 GitHub Release 的重定向下载地址；普通下载入口和商店包地址需要分开管理。
- 处理：为 Windows x64 / arm64 安装包增加 Cloudflare R2 版本化上传流程；发布后用不跟随重定向的 HEAD 请求验证 HTTP 200，并在 R2 自定义域名配置完成前不把 URL 填入 Partner Center。

## 2026-08-12：Windows ARM64 NSIS 安装包因 nsis7z 不支持 7z ARM64 滤镜导致解压中断

- 现象：在 UTM Windows 11 中运行 `AIVPlayer-Setup-0.5.0-arm64.exe` 安装，完成后提示快捷方式指向的 `AIVPlayer.exe` 已经被更改或移动。检查事件查看器发现 Windows Defender 没有任何 1116/1117 拦截事件。检查安装目录发现 `locales`、`resources`、`chrome_100_percent.pak`、`vk_swiftshader_icd.json` 等均存在，但 `AIVPlayer.exe` 以及之后的所有 `.dll` (`d3dcompiler_47.dll`, `ffmpeg.dll` 等) 均未解压出来。
- 经验：检查 `app-arm64.7z` 内部文件的压缩算法发现，按字母顺序排列在 `vk_swiftshader_icd.json` 之前的文件使用的都是通用 `LZMA2:20` 算法；而从 `AIVPlayer.exe` 及之后的二进制文件，7z 使用的是 `Method = ARM64 LZMA2:20`（7-Zip 的 ARM64 可执行文件 BCJ 滤镜）。electron-builder 嵌入的 32 位 `nsis7z.dll` 插件版本较旧（早于 7-Zip 23.00），无法识别 `ARM64` BCJ 滤镜，当解压流遇到 `AIVPlayer.exe` 时静默报错并中断解压，导致 `AIVPlayer.exe` 及后续所有 DLL 从未被解压落地。
- 处理：在 `electron-builder.yml` 的 `nsis` 配置项中同时设置 `useZip: true` 和 `differentialPackage: false`；electron-builder 26.15.3 只有在关闭差分包时才会实际生成 ZIP payload，随后 NSIS 走 `nsisunz` 解压路径，避免对 ARM64 可执行文件添加不兼容的 7z ARM64 BCJ 滤镜。手动修复测试中可使用现代 7-Zip（23+）直接解包应用。

## 2026-08-12：macOS 发布构建下载 FFmpeg 源码时连接被重置

- 现象：v0.5.1 发布流水线的 macOS 任务在下载 FFmpeg 官方源码时收到 `curl: (35) Recv failure: Connection reset by peer`，默认 `--retry 3` 没有重试，导致整个发布汇总任务被跳过。
- 处理：下载固定版本源码时使用 `curl --retry 5 --retry-all-errors`，把连接重置等瞬时网络错误纳入重试范围；下载后继续使用 SHA-256 校验，避免把重试机制变成完整性校验的替代品。

## 2026-08-13：macOS 发布构建不能强制编译无关的 Homebrew 依赖

- 现象：v0.5.3 的 macOS ARM64 Runner 在安装 HEIF / media 依赖时被强制从源码编译 15 个 Homebrew formula，单个 `openssl@3` 就耗时约 7 分钟，随后 x265 的 ARM64 汇编链接因 Xcode 26 / macOS SDK 26 产生空对象文件而失败；libheif 实际配置只启用了 `libde265`、`kvazaar` 和 JPEG 后端，FFmpeg 也由固定源码归档独立构建。
- 经验：发布流水线的依赖列表应按最终 CMake 配置和运行时用途收窄；不能因为部署目标需要固定，就把整个 FFmpeg 依赖图强制源码重编译。构建前应优先使用稳定的预编译包，并让真正的源码构建步骤自行接收 `MACOSX_DEPLOYMENT_TARGET`。
- 处理：macOS 改为一次性安装 `cmake`、`ninja`、`pkg-config`、`libde265`、`kvazaar` 和 `jpeg-turbo`，移除 `HOMEBREW_BUILD_FROM_SOURCE`、CFLAGS/LDFLAGS 及无关 codec formula；同时缓存 Electron 下载、按平台和架构缓存可直接打包的原生运行时，并使用 Windows vcpkg binary cache，避免后续每次发布重复下载或编译。

## 2026-08-13：vcpkg 缓存不能只按已安装目录粗略缓存

- 现象：仅缓存 Windows `C:\\vcpkg\\installed` 目录无法覆盖 vcpkg 的 ABI、端口版本和编译器变化；视觉模型虽然每个 Runner 都会准备一份，但该步骤实测只有几十秒，不能把它误判成当前最长的编译瓶颈。
- 经验：vcpkg 应使用带 ABI 指纹的 GitHub Actions binary cache，让缓存命中由端口、triplet 和工具链共同决定；架构无关的大模型可以按源码中的固定 revision 缓存，主要用于降低外网失败概率和重复带宽消耗。
- 处理：Windows x64 / ARM64 设置 `VCPKG_BINARY_SOURCES=clear;files,C:/vcpkg/binary-cache,readwrite` 与 `VCPKG_FEATURE_FLAGS=binarycaching`，并用稳定的显式版本 Key 持久化该 binary cache 目录；五个平台增加按 FFmpeg、libheif、whisper.cpp 版本和构建脚本指纹生成的 native runtime 成品缓存，视觉模型下载因实测只有几十秒暂不单独缓存，避免恢复大文件缓存抵消收益。

## 2026-08-13：发布流水线需要缓存最终原生运行时，而不只是编译器中间产物

- 现象：仅配置 Electron 下载缓存和 vcpkg binary cache，新的 Runner 仍然会重新执行 libheif、whisper.cpp 和 macOS FFmpeg 的源码构建；Windows 的 `Invoke-WebRequest` 还会因 `ResponseEnded` 让整个 Job 失败。
- 经验：固定版本的发布运行时只要包含平台、架构、依赖版本和构建脚本指纹，就可以直接缓存最终的 `resources/ffmpeg`、`resources/heif`、`resources/whisper.cpp`；缓存命中后只需执行运行时校验，不应继续进入源码编译步骤。外部大文件下载要写入 `.part` 临时文件，成功后再移动，并校验 SHA-256。
- 处理：五个平台增加隔离的 native runtime 成品缓存；Windows FFmpeg 改用 `curl.exe` 重试下载和校验，ARM64 先下载 FFmpeg、再执行 vcpkg，避免网络故障时先浪费原生依赖编译时间；macOS FFmpeg 安装后改为检查文件存在并补充执行权限，保留后续 Mach-O 部署目标校验。
- 追加修正：macOS FFmpeg 的 `--bindir` 必须使用安装目录的绝对路径；仅写 `--bindir=bin` 时，`make install` 日志看似成功，但产物不在预期目录，导致缓存无法生成。Linux FFmpeg 下载同样使用 `.part` 文件、`--retry-all-errors` 和 SHA-256 校验。

## 2026-08-13：发布日志中的 HEIF 依赖安装步骤不能替代真实耗时分析

- 现象：macOS 截图看起来像是 `Install HEIF and media runtime dependencies` 卡了很久，实际该步骤只安装了几秒；真正耗时的是后面的 `Build static HEIF runtime`。Windows 的 `Install HEIF build dependencies` 则把固定 FFmpeg 下载解压和 vcpkg 依赖准备混在一起，无法从步骤名判断瓶颈。
- 经验：CI 优化必须按 Actions 的单步开始 / 结束时间和日志拆解下载、依赖安装、源码编译、打包，不能根据截图箭头或步骤名称直接归因。
- 处理：macOS libheif 构建切换到 Ninja 并显式传入 CPU 并行度，只构建发布真正需要的 `heif-dec` / `heif-enc` 目标；Windows 将 FFmpeg 归档准备、vcpkg HEIF 依赖安装拆为独立步骤，并缓存固定 FFmpeg 归档，后续可分别观测和复用。

## 2026-08-13：CMake `--parallel` 不带数值不能保证 Unix Runner 并行编译

- 现象：发布脚本写了 `cmake --build ... --parallel`，但没有指定并行数；在 macOS 默认 Unix Makefiles 下不能把它当作明确的多核构建保证，libheif 冷构建因此可能长时间串行执行。
- 经验：跨平台 CI 应显式选择 Ninja 或显式传递 `--parallel <jobs>`；目标数量也应只包含发布实际使用的工具，避免编译无用的开发目标。
- 处理：`build-heif-source.ts` 默认使用 Node `availableParallelism()`，支持 `--jobs` / `--generator`，macOS 发布调用 Ninja 和 `sysctl -n hw.ncpu`，Windows 显式使用 Runner 的处理器数；保留 `heif-info` 目标以满足当前 libheif 安装脚本，同时不额外构建未被发布流程使用的测试和图形示例目标。

## 2026-08-13：vcpkg 二进制缓存不能覆盖首次源码下载失败

- 现象：Windows ARM64 首次构建虽然已经启用 vcpkg binary cache，但仍需从上游下载 `libjpeg-turbo` 等端口源码；GitHub 临时返回 503 时，vcpkg 会在进入 CMake 编译前直接失败，尚未生成可复用的原生运行时缓存。
- 经验：vcpkg 的已编译包缓存和端口源码下载缓存是两层不同的缓存，前者不能替代后者；源码归档应放到显式的 `VCPKG_DOWNLOADS` 目录，并按平台、架构和依赖版本持久化。
- 处理：Windows x64 / ARM64 发布 Job 增加 `C:/vcpkg/downloads` 的 Actions cache，安装依赖前确保目录存在；后续遇到同一端口的瞬时网络错误时可直接复用已下载归档，再由 vcpkg 做校验和验证。

## 2026-08-13：原生总缓存不能替代单个昂贵构建的独立缓存

- 现象：macOS 的 FFmpeg、libheif 和 whisper.cpp 原本共用 `resources` 原生运行时缓存；只要其中任意构建脚本变化，整个缓存键就失效，固定 FFmpeg 即使源码和配置没有变化也会重新执行约 4 分钟的 `configure` / `make`。
- 经验：多个相互独立的原生构建不能只依赖一个总成品缓存；应按稳定的源码版本、校验和、架构和构建配置拆分缓存。总缓存负责最终发布复用，子缓存负责避免无关变更触发重复编译。
- 处理：macOS 增加独立的 `ffmpeg-install` Actions cache，命中后跳过源码解压和编译，只保留二进制存在性、权限和版本校验；如果修改 FFmpeg 配置，需要显式递增 `FFMPEG_MACOS_CACHE_VERSION`，避免复用不兼容产物。

## 2026-08-13：Electron Smoke 不能只等待任务 revision 写入

- 现象：批量视觉导出重建 Smoke 只等待新任务写入 `searchRevision`，但任务此时可能仍处于 `running`；随后立即断言任务必须为 `failed`，在真实 Electron 的异步调度下产生偶发失败。
- 经验：宿主 Smoke 的持久化字段写入不等于业务任务已经进入可断言终态。涉及后台任务时，等待条件必须同时覆盖任务数量、关键快照和终态状态，不能用中间态字段作为完成信号。
- 处理：等待两个新建任务都具备 `searchRevision` 且 `status === 'failed'` 后再执行路径、原任务保留和冲突计数断言；修复后批量重建 Smoke 通过，功能代码无需修改。

## 2026-08-13：Electron 对话框必须从宿主上下文注入

- 现象：新增 Clip Inbox 导入 Smoke 时，尝试用 `page.evaluate` 解构 Electron `dialog`，TypeScript 报参数签名错误，且页面上下文无法可靠替换主进程的文件选择器。
- 经验：Playwright 的页面上下文只负责 DOM；`dialog.showOpenDialog` / `showSaveDialog` 属于 Electron 主进程 API，Smoke 必须使用 `ElectronApplication.evaluate` 注入，并在导入按钮点击前完成替换。
- 处理：把保存 / 打开对话框夹具统一改为 `app.evaluate(({ dialog }, path) => ...)`；UI 契约只断言用户可见按钮和状态刷新，不要求 Smoke 直接调用 preload API，避免测试绕过真实交互链路。

## 2026-08-13：导入集合不能复用外部 ID

- 现象：如果把 JSON 备份中的集合 ID 原样写回本地，重复导入会走更新路径覆盖已有集合，备份恢复也会破坏用户当前选段。
- 经验：可迁移导入和本地编辑更新是两种不同语义；导入必须剥离外部主键，保留业务字段但由本地 Store 生成新 ID。
- 处理：解析器返回不含 `id` 的 `VisionClipCollectionInput`，Store 通过独立 `importCollection` 入口强制新建；Smoke 覆盖删除原集合后导入并断言新 ID。

## 2026-08-13：Release 发布前必须移除未启用的对象存储步骤

- 现象：0.5.4 发布流水线在创建 GitHub Release 前卡在旧 MinIO 上传步骤；随后确认 Cloudflare Wrangler 单对象上传上限为 315MB，而 Windows 安装包可能超过 500MB，不能直接替换成 Wrangler 上传。
- 经验：当对象存储方案尚未确定或凭据、分片策略尚未就绪时，普通 GitHub Release 不应依赖对象存储步骤；未启用的上传逻辑必须从发布主链路移除，避免构建成功却无法进入 Release 创建。
- 处理：发布工作流改为仅汇总并校验五个平台产物，创建 GitHub Release；MinIO、Cloudflare R2 和其他对象存储暂不参与 0.5.4 发布。

## 2026-08-13：发布渠道下线必须同步清理全部旧镜像依赖

- 现象：旧镜像 token 未配置时 job 仍以 success 结束，容易把“跳过同步”误判成“同步成功”；镜像逻辑还残留在工作流、脚本、远端校验、测试、README 和 Pages 页面。
- 经验：发布渠道下线不能只删除一个 job，必须用全仓库检索清理凭据、API 分支、脚本、测试、文档和下载入口；可选渠道跳过不能作为发布成功证据。
- 处理：移除旧镜像同步 job、同步脚本和远端校验分支，发布流程只保留 GitHub Release；未来大陆下载入口单独接入 Cloudflare R2。

## 2026-08-13：Electron Smoke 空状态选择器不能只匹配 CSS 类名

- 现象：批量集合导出 / 导入 Smoke 在删除原集合后等待 `.vision-empty` 时，页面同时存在影视库、相似搜索结果和集合三个空状态节点，Playwright 严格模式拒绝从多个匹配项中选择一个。
- 经验：共享 CSS 类名只能说明布局角色，不能证明业务状态唯一；Smoke 等待状态时应使用具体可见文案或更窄的业务容器，避免把“页面已加载”误判成“目标集合为空”。
- 处理：改为精确等待“还没有保存的选段集合。”，随后真实 Electron Smoke 通过，未修改功能代码。

## 2026-08-13：Vitest 不能默认扫描包含嵌套 worktree 的仓库根目录

- 现象：项目根目录存在 `.worktrees/` 时，`npm test` 会把 worktree 中的同一批测试再次扫描执行，造成测试重复、资源竞争和超时，且失败日志容易误判为代码回归。
- 经验：测试入口必须明确限定正式测试目录，不能依赖测试框架从包含构建目录、缓存目录或嵌套 worktree 的仓库根目录自动发现文件。
- 处理：将 `npm test` 固定为 `vitest run --dir tests --exclude .worktrees/**`，让完整测试只执行主工作树的 `tests/`；仅传入 `tests` 路径不足以阻止 Vitest 继续扫描嵌套 worktree。

## 2026-08-13：Cloudflare Pages workflow 不能监听整个 docs 目录

- 现象：Pages workflow 使用 `paths: docs/**`，导致只修改 `docs/RELEASE.md` 这类发布手册也会触发公开站点部署；同时把整个 `docs/` 作为 Wrangler 部署目录，会把仓库文档和内部计划一起纳入公开站点输入。
- 经验：公开站点源码和仓库工程文档必须分开布局，CI 的触发路径与实际部署根目录必须指向同一个最小站点目录，不能用宽泛的父目录代替。
- 处理：将公开页面、样式、脚本和站点图标迁移到 `docs/site/`，Pages workflow 改为只监听 `docs/site/**` 并部署 `docs/site`；Flatpak 截图等仍属于构建输入的资源留在 `docs/assets/`，不随 Pages 发布。

## 2026-08-14：官网语言选择器不能使用孤立的占位字符

- 现象：官网导航语言下拉框左侧出现单独的“文”字，视觉上像多余菜单项。
- 经验：语言选择器的装饰内容不能用硬编码汉字充当图标；需要图标时应使用已确认存在且有语义说明的 SVG / CSS 图标，否则不同语言页面都会暴露实现占位符。
- 处理：删除语言选择器中的孤立“文”字符，保留隐藏的可访问性标签和原生语言下拉框，避免影响自动识别与手动切换。

## 2026-08-14：官网下载区不能让多个平台卡片指向同一个入口

- 现象：macOS、Windows、Linux 三张卡片虽然看起来是平台选择，实际都跳转到同一个 GitHub Releases 页面；用户还要继续判断平台和架构，主入口显得拥挤。
- 原因：页面只维护静态平台文案，没有以真实 Release 资产为来源的可用下载清单，也没有区分“自动推荐”和“历史版本”两种下载路径。
- 经验：下载页应该先完成一次基于 User-Agent / userAgentData 的平台与架构推荐，再提供手动选择；推荐项只能来自真实 manifest，不能把不存在的 macOS Intel 安装包宣传成可用版本。
- 处理：用版本化 R2 对象和稳定 `download-manifest.json` 驱动下载；R2 只保留当前版与上一版，发布时显式列举并删除旧前缀，历史版本回退到 GitHub Releases。

## 2026-08-14：带边框的官网区块必须设置内部边距

- 现象：快速开始区块有背景和边框，但“打开视频。继续工作。”标题以及右侧步骤列表直接贴着容器边缘。
- 原因：`.quickstart` 只设置了上下 padding，没有设置左右 padding；由于它同时承担 `.shell` 容器和视觉卡片的职责，内容会直接落在边框内侧。
- 经验：一个元素既是宽度容器又是带边框的视觉面板时，必须显式设置 `padding-inline`，不能只依赖外层 `margin-inline: auto` 提供内容间距。
- 处理：为 `.quickstart` 增加响应式左右内边距，桌面端与移动端都保持标题、列表和边框之间有稳定间距。

## 2026-08-14：官网面板不能全部使用直角边框

- 现象：官网下载卡片、快速开始区块、预览截图和按钮全部使用接近直角的边框，视觉语言偏硬，与当前常见的圆角矩形产品界面不一致。
- 经验：圆角需要按层级统一，而不是给所有元素套同一个大圆角；面板、媒体、控件和按钮应分别使用大、中、小三档圆角。
- 处理：增加统一的圆角 token，为主要面板、下载卡片、截图、按钮和选择控件设置分层圆角，同时保留分隔线列表的直线结构。

## 2026-08-14：官网下载选择器不能直接暴露浏览器原生控件

- 现象：手动平台 / 架构选择弹出浏览器原生列表，视觉风格和页面不一致；平台图标使用 `⌘` 等字符近似，也无法准确表达对应系统。
- 经验：营销官网的交互控件要统一品牌视觉，同时保留键盘、焦点和 ARIA 语义；平台图标应使用有语义的 SVG，不要用字符占位。
- 处理：将原生 `select` 改为自定义 listbox trigger / menu，增加 Apple、Windows、Linux SVG 图标和完整的键盘导航、焦点反馈、外部点击关闭行为，并补充桌面 / 移动端间距规则。

## 2026-08-14：macOS 的 MacIntel 标识不能直接当作 Intel 架构

- 现象：官网在 Apple Silicon Mac 的浏览器中把 `navigator.platform === MacIntel` 当作 x64；当前 Release 只有 arm64 安装包，于是推荐卡错误降级为“查看可用版本”，用户看不到直接下载入口。
- 原因：浏览器为了兼容旧网站，Apple Silicon 上也可能暴露 `MacIntel`，这个字段不能单独证明设备是 Intel Mac；同时 R2 清单当前返回 404，页面会按设计回退到内置 GitHub Release 清单。
- 经验：自动下载必须区分“可靠的架构信号”和“平台兼容标识”。macOS 没有可靠架构信息时不能强行猜 x64，应从当前平台的可用资产中推荐，并让推荐按钮直接指向真实安装包；图标也不能手写近似品牌轮廓。
- 处理：移除 `MacIntel` 的 x64 推断，macOS 架构未知时按可用 arm64 资产推荐；Apple 图标改用 Simple Icons 的正式 SVG 路径，并保留 GitHub 直接下载回退。

## 2026-08-14：下载区不能把历史版本降级成普通文字链接

- 现象：页面只有当前版本自动推荐和手动平台 / 架构选择，历史版本被压缩成“查看全部版本”文字链接，无法直接下载上一版本。
- 经验：下载页的三条用户意图必须同时可见：当前版本、历史版本、指定平台 / 架构；历史版本应从 manifest 的第二个 release 生成直接下载，而更老版本再跳 GitHub。
- 处理：新增独立历史版本下载面板和版本 listbox，补齐 v0.5.4 回退清单及多语言文案，并保留 GitHub Releases 作为更老版本入口。

## 2026-08-14：R2 大安装包不能使用 Cloudflare REST API 单次上传

- 现象：R2 清单不存在时，官网回退到 GitHub 直链，最终浏览器看到 `release-assets.githubusercontent.com` 的临时签名地址；手动同步 v0.5.5 / v0.5.4 时，v0.5.4 的 919 MB AppImage 上传返回 HTTP 413。
- 原因：发布脚本用 Cloudflare REST API 单次 PUT 上传安装包，适合小对象管理，不适合接近 1 GB 的桌面安装包；同步 workflow 之前也从未运行过，所以 R2 没有最新两个版本的对象和清单。
- 经验：下载页的 R2 分发必须以公开清单和对象实际存在为完成条件；如果发布范围只包含小于 REST 上限的当前版和上一版，不应为了跳过的超大旧版本引入另一套凭据。
- 处理：发布脚本统一使用 `CLOUDFLARE_API_TOKEN` 的 REST PUT；超过 300 MB 的安装包在上传前明确失败，workflow 不再读取 R2 S3 凭据，所有两个版本资产成功后才写清单和清理旧对象。

## 2026-08-14：不要为跳过的旧版本引入 R2 S3 凭据

- 现象：为了处理不再纳入保留窗口的 v0.5.4 超大 AppImage，引入了 `CLOUDFLARE_R2_ACCESS_KEY_ID` 和 `CLOUDFLARE_R2_SECRET_ACCESS_KEY`，使正式发布依赖第二套 Secret。
- 经验：发布策略已经明确只保留 v0.5.6 和 v0.5.5 时，上传实现应按这两个版本的实际资产约束设计；不要让被放弃的旧版本扩大权限面和配置面。
- 处理：删除 S3 multipart 依赖和两个 Secret，恢复为 Cloudflare API Token REST 上传；对超过 300 MB 的未来资产提前报错，要求另行决定分发方案。

## 2026-08-14：官网保留版本必须跟正式发布版本对齐

- 现象：官网回退清单仍把 v0.5.4 当作上一版本，实际发布策略已经调整为把当前代码作为 v0.5.6 发布，并保留 v0.5.5。
- 经验：R2 的 retention 是“当前正式版本 + 上一个正式版本”，不能把固定旧版本写死在官网回退清单；发布新版本时版本号、fallback、manifest 和 R2 同步参数必须一起更新。
- 处理：本次发布准备统一为 v0.5.6 / v0.5.5，正式 Release workflow 发布后由清单驱动两版 R2 直链，更早版本继续通过 GitHub Releases 获取。

## 2026-08-14：Windows 自动更新不能把静默参数写反

- 现象：AIVPlayer 下载更新后点击“重启并更新”，Windows 弹出完整的 NSIS 安装向导，要求用户重新选择安装范围并点击“下一步”。
- 原因：`electron-updater.quitAndInstall()` 的第一个参数是 `isSilent`；调用 `quitAndInstall(false, true)` 会明确要求以非静默模式启动安装器。`electron-builder` 的 `oneClick: false` 只决定用户手动双击安装包时是否显示向导，不能替代自动更新的静默参数。
- 经验：Windows 自动更新要区分“安装器仍会执行文件替换”和“用户是否看到安装流程”两个语义；希望实现类似 VS Code 的重启体验时，必须传入 `quitAndInstall(true, true)`，让 NSIS 收到 `/S` 并在完成后强制启动新版本。
- 处理：将自动更新改为静默安装并自动重启，同时把源码回归测试从 `false, true` 固定为 `true, true`；后续验证应覆盖已下载更新、应用退出、静默替换和新版本重新启动。

## 2026-08-15：Electron Smoke 原生确认框必须与点击并行等待

- 现象：批量删除 Smoke 先等待删除按钮 `click()` 完成，再等待 `dialog` 事件；原生 `window.confirm` 出现后，Playwright 点击 Promise 会一直等待对话框处理，脚本最终超时。
- 经验：会阻塞页面动作的 Electron 原生对话框不能在点击完成后再处理；必须先注册对话框监听，让点击和 accept / dismiss 并行执行。
- 处理：将确认框处理改为 `page.waitForEvent('dialog')` 与按钮点击放入 `Promise.all`，并分别验证取消和确认路径，Smoke 随后通过。

## 2026-08-15：批量重命名规则不能提前清除有效间隔空格

- 现象：批量重命名第一次实现把前缀 / 后缀直接 `trim()` 后再拼接，用户输入“旅行 · ”和“ · 精选”时，预览变成“旅行 ·集合· 精选”，标题间隔丢失。
- 经验：规则输入需要区分“判断是否为空”和“保留实际语义”。前缀 / 后缀首尾空格可能是用户刻意添加的分隔符，不能在规范化阶段无条件删除。
- 处理：只用 `trim()` 判断规则是否为空，实际值保留用户空格并限制长度；核心测试覆盖带间隔的前缀 / 后缀，Smoke 覆盖最终标题和持久化结果。

## 2026-08-15：内联改名不能共享未锁定的全局输入状态

- 现象：集合标题编辑状态保存在面板级状态中，如果编辑期间仍允许点击另一张卡片的编辑入口或批量操作，后一次操作会覆盖前一次输入，用户可能误保存错误标题。
- 经验：当列表卡片复用一个编辑状态时，必须把“编辑中”视为整个集合操作域的忙碌状态，而不是只在异步保存期间锁定；保存和取消按钮仍需保持可用。
- 处理：编辑态纳入集合批处理忙碌条件，锁定其他编辑入口、复选框和卡片操作；补充 Electron Smoke 覆盖保存、取消和空标题失败后仍留在编辑态。

## 2026-08-15：标签编辑的空输入应表示清空而不是拒绝

- 现象：集合标题需要拒绝空值，但标签是可选元数据；如果沿用标题的“空输入不保存”判断，用户无法通过内联编辑移除最后一个标签。
- 经验：同一张卡片上的不同字段不能共享过于粗糙的必填校验；标签输入应先统一归一化，再比较结果，空数组是合法的清空操作。
- 处理：标签编辑直接复用 `normalizeVisionCollectionTags`，空白输入保存为 `[]`，并用重复标签、Escape 取消和清空后的重设 / 重载 Smoke 固化语义。

## 2026-08-15：集合筛选不能改变批量选择的数据语义

- 现象：集合列表增加本地筛选后，如果把“全选”或已选集合范围改成只针对当前可见行，隐藏集合的选择可能被意外丢弃，批量复制 / 导出 / 删除会出现用户无法预期的范围变化。
- 经验：筛选是视图层状态，批量操作仍应以现有 `selectedCollectionIds` 为准；“全选集合”继续表达全部已保存集合，而不是当前筛选结果，避免同一个选择集合在筛选开关前后失去一致性。
- 处理：名称 / 标签筛选只生成 `visibleCollections`，批量按钮和已选集合仍使用完整 `collections`；Smoke 同时校验筛选、清除和持久化数据未发生变化，后续若增加“全选当前结果”必须单独设计并明确文案。

## 2026-08-15：批量标签必须明确替换与清空语义

- 现象：批量标签操作如果只提供一个模糊的“编辑”按钮，用户无法判断输入是追加到原标签、替换原标签，还是只影响当前筛选可见集合；空输入也容易被错误当成无效提交。
- 经验：批处理字段必须在界面文案和确认框中明确作用范围与数据语义；集合标签采用“对所有已选集合替换同一组标签”，空输入是明确的清空操作，筛选只影响视图而不改变已选 ID 范围。
- 处理：批量更新复用 `normalizeVisionCollectionTags`，主进程在单事务内更新全部有效 ID；UI 在提交前确认标签内容，Smoke 覆盖归一化、清空、取消确认、非目标集合和选段元数据保持。

## 2026-08-15：批量标签 Smoke 不能依赖集合返回顺序

- 现象：批量标签 Smoke 第一次按返回数组下标比较第一个集合的排序和证据，实际列表按 `updatedAt` 倒序，合法的更新顺序变化被误报成元数据损坏。
- 经验：持久化列表通常有更新时间排序，批量操作后的验证必须按稳定主键 / 集合 ID 查找，不应假设输入顺序或返回顺序一致。
- 处理：将 Smoke 的元数据断言改为按原集合 ID 精确匹配，并保留数据内容与 Renderer 错误检查，避免测试顺序偶然性。

## 2026-08-15：追加 / 移除标签模式不能静默接受空输入

- 现象：批量标签增加追加和移除模式后，如果继续把空输入当成合法提交，用户点击确认可能得到“成功但没有变化”的结果，无法判断是否真的执行了操作。
- 经验：同一个输入框在不同操作模式下，空值语义必须分别定义；替换模式的空值是清空，追加 / 移除模式的空值应当阻止提交并提示至少输入一个标签。
- 处理：Renderer 根据模式计算 `canUpdateCollectionTags`，追加 / 移除且没有归一化标签时禁用按钮；主进程仍复用归一化和事务更新，避免绕过 UI 的请求产生不一致语义。

## 2026-08-15：全局标签清理不能复用有限数量的批量 ID 接口

- 现象：标签管理器的目标是清理所有匹配集合，如果直接复用当前选中集合的批量标签接口，就会被最多 20 个 ID 的保护上限和当前视图选择范围截断，用户看到的使用数量与实际清理范围不一致。
- 经验：面向“全库 / 全集合”的动作必须拥有独立的数据合同和主进程事务；界面筛选只能影响观察范围，不能偷偷改变全局清理范围。
- 处理：新增按规范化标签查询全部集合的 Store 方法和独立 IPC，事务只更新命中的 `tags_json` 并返回更新后的集合，保留现有批量接口的 ID 上限与安全边界。

## 2026-08-15：破坏性标签操作的确认信息必须包含对象和数量

- 现象：只显示“清理标签”而不显示实际标签名和命中数量，用户无法判断即将影响哪些数据，尤其容易把单集合操作误解成全局操作。
- 经验：破坏性批处理的确认框至少要说明目标对象、预计影响数量和动作；取消后必须验证数据与界面选择均保持不变。
- 处理：确认文案包含标签和命中集合数量，标签管理器 Smoke 同时覆盖确认、全局结果、未命中集合和取消确认。

## 2026-08-15：集合标签管理 Smoke 仍然要按稳定 ID 验证元数据

- 现象：清理标签会改变 `updatedAt`，集合列表返回顺序可能变化；如果按数组下标检查排序或证据，就会把正常的更新时间排序误判成数据损坏。
- 经验：所有会更新集合时间的批处理 Smoke 都必须先保存 ID，再按 ID 比对标签、排序和证据等不变量。
- 处理：标签管理 Smoke 按原集合 ID 查找清理结果，并明确断言第三个集合未改写、排序和 evidence ID 保持不变。

## 2026-08-15：标签重命名遇到已有目标标签必须合并去重

- 现象：如果只把旧标签字符串替换成新标签字符串，目标标签已经存在的集合会产生重复标签，标签统计也会把同一语义拆成两个条目。
- 经验：全局标签迁移不是简单的 SQL 字符串替换；每个集合都要先把旧标签映射为新标签，再复用统一归一化规则去重、去空并保留标签顺序。
- 处理：Store 使用独立重命名事务，目标标签已存在时合并为单个标签；Smoke 同时创建“旧标签 + 新标签”的集合并断言迁移后只剩一个目标标签。

## 2026-08-15：新 IPC 能力的函数命名必须在实现和导入处保持一致

- 现象：标签重命名核心函数命名为 `renameVisionCollectionTag`，批量导入时误写成 `renameVisionClipCollectionTag`，导致测试运行时 ReferenceError 和 TypeScript 导入错误。
- 经验：共享能力命名同时出现在操作层、Store、IPC、preload 和测试中，批量编辑导入时不能只依赖字符串替换；新增符号后应立即运行最小核心测试和类型检查。
- 处理：修正所有导入为同一名称，并把核心测试与类型检查放在界面提交前，避免错误扩散到 Smoke 阶段。

## 2026-08-15：Smoke 定位器要跟随可访问名称而不是旧提示文案

- 现象：批量标签输入为了支持追加 / 移除模式，将 placeholder 从“留空清空”改成通用输入提示，旧 Smoke 仍按旧 placeholder 作为 textbox accessible name，导致真实交互在第一步等待超时。
- 经验：UI 文案变化会影响基于 role / accessible name 的宿主测试；可访问名称应表达控件稳定职责，Smoke 也要在界面合同变化时同步更新，而不是依赖旧提示语。
- 处理：输入框使用稳定的“输入标签（用逗号分隔）”名称，操作说明放到旁边的辅助文案；Smoke 改用新名称并重跑完整替换 / 追加 / 清空 / 移除 / 取消链路。

## 2026-08-15：标签撤销快照必须覆盖重命名可能新建的目标元数据

- 现象：第一次实现撤销重命名时只记录操作前已有的元数据标签；当旧标签有样式、目标标签没有样式时，重命名会新建目标元数据，撤销后目标行残留，标签目录出现幽灵样式。
- 经验：快照不仅要保存“当时存在的行”，还要记录操作可能触碰的键集合；删除 / 重命名等操作恢复前应先清理这组键，再写回原快照。
- 处理：重命名快照额外加入旧标签和目标标签，清理快照额外加入被清理标签；撤销在同一 SQLite 事务内删除快照键的当前行并恢复原元数据，同时按历史时间逆序保留更早操作。

## 2026-08-15：撤销最近操作后不能误判历史已经为空

- 现象：撤销清理后，清理前的样式保存记录仍是最近一条未撤销历史；如果 UI 直接把历史置空，用户会丢失继续撤销更早操作的入口。
- 经验：撤销历史应区分“当前记录已撤销”和“没有任何可撤销记录”；撤销完成后必须重新从主进程读取最新未撤销记录，而不是只依赖本地状态推断。
- 处理：SQLite 记录 undone_at，撤销只标记当前记录，Renderer 每次成功操作后刷新历史；Smoke 覆盖清理撤销、应用重启、第二次撤销和历史耗尽。

## 2026-08-15：批量清空标签后撤销入口不能依赖标签管理器

- 现象：批量替换为空输入会合法地清空所选集合标签；如果撤销按钮只渲染在“存在标签统计”的管理器内部，清空成功后管理器本身消失，用户无法从界面恢复刚才的操作。
- 经验：破坏性操作的恢复入口必须独立于被操作数据的当前可见状态；空态、无匹配态和数据被清空的状态都要保留可访问的恢复路径。
- 处理：批量标签操作写入统一撤销历史；当集合仍存在但标签统计为空时，Renderer 显示独立撤销卡片，恢复后再回到标签管理器。

## 2026-08-15：原生颜色控件的直接赋值不会触发 React 受控状态

- 现象：标签元数据 Smoke 通过父标签选择，但直接给 `input[type="color"]` 赋值后点击保存，SQLite 仍保存界面默认颜色；颜色控件看起来改变了，实际 React 状态没有更新。
- 经验：Electron Smoke 操作原生受控输入时，不能只修改 DOM 属性；React 的 value tracker 可能捕获不到直接赋值，导致提交的数据与截图看到的控件不一致。
- 处理：Smoke 使用 `HTMLInputElement.prototype.value` 的原生 setter，再派发冒泡的 `input` / `change` 事件；同时验证 IPC 返回值、重载后的控件值和 SQLite 元数据，避免只验证视觉状态。

## 2026-08-15：标签样式元数据不能混入既有 tags_json

- 现象：如果把颜色和父标签直接编码进集合标签字符串，标签统计、重命名、清理和旧数据库兼容都会被迫处理复合格式，容易产生重复标签或遗留样式。
- 经验：已有集合标签是用户数据，样式和关系属于可选目录元数据，应使用独立表并以标签名关联；这样旧数据库无需迁移 `tags_json`，标签操作也能显式迁移或清理元数据。
- 处理：新增 `clip_tag_metadata` 表和独立 IPC；重命名在同一事务内迁移样式 / 父级引用，清理同步删除元数据并解除父级引用，颜色统一限制为 `#RRGGBB`。

## 2026-08-15：父标签层级必须同时防自指和间接环路

- 现象：父标签最初只校验“不能选择自己”，当 `项目 → 访谈 → 海边` 已存在时，把 `项目` 的父标签改为 `海边` 会形成间接环路；界面如果继续展示该候选，也会把错误交互交给主进程处理。
- 经验：树状元数据不能只做单节点校验；保存前要沿父级链路遍历并记录已访问节点，同时在 UI 过滤会闭合环路的候选，主进程和 Store 都要保留最终防线。
- 处理：新增共享环路检测和路径计算函数，Store / IPC 双层拒绝环路，标签按钮展示完整根路径；Smoke 覆盖三层路径、候选过滤、IPC 拒绝和重载持久化。

## 2026-08-15：撤销历史不能用随机 UUID 打破同毫秒操作顺序

- 现象：连续保存标签元数据后立即清理或重命名时，多条记录可能拥有相同的 `created_at`；再按时间和随机 UUID 排序，会偶发把较早的元数据操作当成最新撤销目标。
- 经验：审计历史需要稳定的插入序号，时间戳只适合作为展示字段，不能在同一毫秒内承担唯一排序职责。
- 处理：撤销查询和最多 20 条历史清理改用 SQLite 隐式 `rowid` 倒序，保留现有 `created_at` 作为记录时间；补跑核心撤销回归确认连续操作按真实写入顺序处理。

## 2026-08-15：筛选列表变化时详情区不能继续编辑隐藏标签

- 现象：标签管理器开启“仅看收藏”后，列表只显示收藏标签，但详情区仍可能保留筛选前选中的非收藏标签；截图中列表和详情指向不同标签，容易造成误编辑。
- 经验：局部筛选不仅要过滤列表，还要同步当前选择状态；如果选择项被筛掉，应自动切换到第一个可见项或进入明确空态。
- 处理：管理标签从可见统计中重新选择，Smoke 增加收藏筛选后检查列表与详情一致，并重新检查截图。

## 2026-08-15：标签排序 Smoke 要限定作用域和运行时顺序

- 现象：页面中标签管理器和集合卡片都使用“排序”下拉，未限定容器会产生多个匹配；Node 与 Chromium 的 `localeCompare` 顺序也可能不同；集合保存返回顺序和 SQLite 列表顺序也不保证一致。
- 经验：Smoke 定位器要绑定功能容器；排序期望要在同一运行时计算；跨 IPC / SQLite 比较集合时按稳定 ID 对齐，不能假设创建顺序。
- 处理：Smoke 使用 `.vision-collection-tag-manager-filter` 限定标签排序控件，在 Renderer 计算名称排序期望，并按集合 ID 排序后比较 `tags`；最终三种排序 Smoke 通过。

## 2026-08-16：标签自定义顺序不能在重载空态阶段覆盖偏好

- 现象：自定义顺序第一次 Smoke 在重载后丢失；Renderer 初始渲染时集合数据还没异步加载，标签列表为空，顺序合并 effect 先把已保存数组清成空数组，随后新标签按名称重新追加。
- 经验：异步数据驱动的本地偏好不能把“暂时没有数据”当成“用户没有偏好”；初始化阶段应跳过破坏性归并和写回，等到真实数据集合非空后再清理失效项、追加新项并持久化。
- 处理：标签顺序合并和写回均在标签统计非空时执行；Smoke 增加自定义排序、上移、重载后模式 / 顺序一致性和集合 `tags` 不变检查，首次失败后重新构建并通过。

## 2026-08-17：Git 索引锁权限错误先区分沙盒限制和真实锁竞争

- 现象：提交前 `git add` 报 `Unable to create .git/index.lock: Operation not permitted`；只读检查发现锁文件并不存在，索引属于当前用户，说明不是遗留锁或并发 Git 进程。
- 经验：Git 写索引需要创建临时锁文件；默认沙盒即使能读 `.git/index`，也可能禁止创建 `.git/index.lock`。不能在没有确认占用者的情况下删除锁文件，更不能把权限错误直接判断为“抢锁”。
- 处理：先检查 `.git/index.lock`、索引所有者和活动进程；确认没有真实锁后改用宿主权限执行 `git add` / `git commit`，并继续保留分阶段提交策略。

## 2026-08-15：Map 迭代器不能直接调用数组方法

- 现象：标签元数据导入核心第一次类型检查失败，`Map.values()` 返回 `MapIterator`，直接调用 `filter` 触发 TypeScript 编译错误。
- 经验：从 `Map` / `Set` 取出的迭代器不能假设拥有数组方法；涉及筛选、排序或多次遍历时要显式展开，并让类型检查尽早覆盖新事务代码。
- 处理：将 `existingByTag.values()` 先展开为数组再筛选，单独提交修复，并重跑完整 `npm run typecheck`。

## 2026-08-15：Smoke 通过 preload 写入数据后要重载 Renderer

- 现象：标签目录传输 Smoke 通过 preload IPC 创建集合后，Renderer 的 `collections` 状态仍是创建前快照，导出按钮尚未渲染，等待按钮超时。
- 经验：Smoke 如果绕过界面直接写入数据库，不能假设 React 状态自动订阅主进程变化；写入后必须重载或显式刷新，再开始 UI 断言。
- 处理：集合和标签元数据 fixture 写入完成后重载并重新打开影视库面板；同时用文件内容和 IPC 查询验证持久化，而不是只依赖按钮是否出现。

## 2026-08-15：窄面板新增操作按钮必须验证标题区布局

- 现象：标签管理器新增导入 / 导出按钮后，Smoke 截图显示标题和描述被 flex 子项挤成逐字竖排，功能断言虽然通过但视觉不可用。
- 经验：右侧面板属于窄布局，新增操作组不能只看桌面宽度；标题、副标题和操作按钮需要明确的换行合同，Smoke 截图要作为布局验收证据。
- 处理：将标题文案与传输操作拆成两行，重新构建、运行 Smoke 并复核截图后单独提交布局修复。

## 2026-08-16：标签导入必须把预览和写入拆成两个阶段

- 现象：版本化标签目录最初在用户选择文件后立即调用 Store 导入；遇到本地同名标签时，用户没有机会确认覆盖范围，也无法保留本地或跳过单项。
- 经验：涉及批量元数据覆盖的导入流程应先读取、校验并比较当前状态，返回可审阅的差异清单；真正写入必须由独立的确认动作触发，默认决策应偏向保留本地。
- 处理：增加 `new` / `unchanged` / `conflict` / `unused` 预览分类，IPC 拆分 preview / apply 通道，界面为每个冲突提供覆盖、保留本地、跳过选择；Smoke 同时覆盖三种决策和二次导入后的本地状态保持。

## 2026-08-16：导入跳过统计不能继续标记为未使用

- 现象：导入 Store 原先的 `skippedCount` 只代表文件中不存在的标签；加入“保留本地”和“跳过冲突”后，如果继续复用“跳过未使用标签”文案，会把用户主动决策误报成数据不存在。
- 经验：统计字段一旦扩展语义，界面文案必须同步从具体原因改成准确的总括描述，未使用项等细分原因应由预览分类承担。
- 处理：应用结果改用“跳过 N 个标签”的通用文案，预览单独展示未使用数量，并在真实 Smoke 中验证 `importedCount: 1`、`skippedCount: 2` 与第二次全跳过结果。

## 2026-08-17：Smoke 不能复用点击前的动态 aria 定位器

- 现象：标签折叠 Smoke 点击“收起子标签”后，按钮立即切换为“展开子标签”；如果继续使用点击前按名称创建的定位器读取 `aria-expanded`，Playwright 会等待旧名称重新出现并最终超时。
- 经验：带状态切换的无障碍名称属于动态 UI 合同；点击后应使用稳定 CSS 定位或按点击后的新名称重新定位，不能把旧的 accessible name 当成永久标识。
- 处理：Smoke 点击后改用“展开子标签: 项目”重新读取 `aria-expanded`，并重新验证父级折叠、中间层折叠、筛选穿透和 Renderer 无错误。

## 2026-08-17：重复文案的 Smoke 定位器必须限定作用域

- 现象：可见集合选择 Smoke 使用全局 `getByText('已选择 3 个集合')`，但批量标签卡片和批量重命名卡片都展示相同数量文案，Playwright 因 strict mode 命中两个元素而失败；功能状态本身已正确更新。
- 经验：同一状态数量可能在多个批处理入口重复呈现，Smoke 不应依赖全局文案唯一性；应优先以稳定容器、角色或语义区域限定定位，再读取动态文本。
- 处理：将选择数量断言限定到 `.vision-collection-batch-tags-actions strong`，并继续覆盖筛选内清除 / 恢复可见选择与筛选外选择保留。

## 2026-08-19：GitHub Actions macOS 签名不能只依赖 electron-builder 自动导入

- 现象：CI 能识别 `Developer ID Application` 证书，但 macOS job 在 electron-builder 开始签名后长时间无输出，取消任务时仍残留 `notarytool` 子进程；DMG / ZIP 尚未生成，问题不在公证或压缩阶段。
- 经验：GitHub macOS runner 上应由工作流显式创建临时钥匙串、导入 `.p12` 并设置 `apple-tool:,apple:` 分区权限；只设置 `CSC_LINK` / `CSC_KEY_PASSWORD` 会把钥匙串生命周期和访问权限交给构建器，遇到 runner 的钥匙串状态变化时可能卡在 `codesign`。
- 处理：使用 `apple-actions/import-codesign-certs@v7` 导入 `MACOS_CSC_LINK`，将 `CSC_KEYCHAIN` 指向 `signing_temp.keychain`，移除 electron-builder 的重复导入路径；同时保留签名、公证、stapler 和 `spctl` 验证。

## 2026-08-19：公证等待不能隐藏在 electron-builder 打包步骤里

- 现象：显式导入钥匙串后，CI 已成功识别 Developer ID Application，但 electron-builder 的 `Build & Package` 仍长时间无输出；取消时能看到残留 `notarytool` 子进程，说明卡点是 Apple 公证提交等待而不是签名或 DMG 压缩。
- 经验：第三方构建器封装的 `notarytool submit --wait` 不便于区分凭据错误、Apple 队列等待和网络超时；发布工作流应把公证从打包中拆出，记录 submission ID 和每次状态，并给单次请求及总等待设置上限。
- 处理：先生成签名 app，使用有界的 `notarytool submit` / `info` 轮询并保存公证信息，Accepted 后 staple app，再用 `--prepackaged` 生成 DMG / ZIP；这样发布日志能明确显示公证阶段，避免把未公证包误上传。

## 2026-08-19：Apple 公证队列可能超过 30 分钟

- 现象：第二次 CI 已成功提交 `AIVPlayer-notarization.zip`，凭据和签名均通过，Apple submission 一直返回 `In Progress`；30 分钟轮询结束时没有 `Invalid` 或 `Rejected`，只是达到本地等待上限。
- 经验：公证耗时受 Apple 服务队列和应用体积影响，不能把 30 分钟当作可靠的完成上限；应保留 submission ID 和最终状态，使用更宽裕的总等待窗口，同时继续拒绝未获得 `Accepted` 的安装包。
- 处理：将工作流公证轮询从 30 分钟延长到 60 分钟，保留每 30 秒一次状态输出及失败证据上传。

## 2026-08-19：Electron Blob 导出 Smoke 不能只等待 download 事件

- 现象：筛选视图导出使用 Blob URL 和动态 `<a download>`，产品点击逻辑已执行，但 Playwright Electron Smoke 连续等待 30 秒都收不到 `download` 事件。
- 经验：桌面 Electron 的下载事件不一定等同于浏览器上下文的 download 事件；测试不能把适配层事件作为唯一导出证据，也不能直接把“无事件”判断为产品导出失败。
- 处理：导出锚点先挂载到 DOM，点击后再移除并异步释放 Blob URL；Smoke 在页面内捕获真实 Blob 和建议文件名，将内容写入临时 JSON，再通过真实文件选择器导入，继续验证序列化内容和用户可见迁移闭环。

## 2026-08-19：Electron Smoke 必须使用最新构建产物

- 现象：集合列表排序控件已经接入源码且类型检查通过，但直接启动 Smoke 时定位不到新控件；原因是 `out/` 仍是接入 UI 之前的旧构建。
- 经验：Electron Smoke 启动的是构建输出，不会实时读取 Renderer 源码；涉及 UI 改动时，Smoke 前必须重新执行 `npm run build`，不能只依赖 TypeScript 检查通过。
- 处理：重新构建后再次执行同一 Smoke，并保留构建通过与排序控件可见作为前置证据。

## 2026-08-19：本地化排序断言要在同一运行时计算

- 现象：列表排序在 Electron 中实际得到正确的中文名称顺序，但 Smoke 用 Node 侧 `localeCompare` 生成期望值，因运行时本地化规则不同而误报失败。
- 经验：涉及 `localeCompare`、日期格式或 Intl 行为的 UI 断言不能跨 Node / Chromium 运行时复用期望结果；测试期望必须和被测代码使用同一运行时或显式固定 locale。
- 处理：将名称排序期望改为通过页面 `evaluate` 在 Electron Chromium 中计算，再验证界面顺序；排序核心仍保留稳定 ID 作为最终消歧。

## 2026-08-19：撤销 Smoke 要区分“撤销完成”和“历史栈为空”

- 现象：批量收藏撤销后，Smoke 直接断言“撤销上次收藏归档操作”按钮消失而超时；实际撤销已经恢复了收藏状态，但更早的归档操作仍未撤销，因此按钮继续显示是正确行为。
- 经验：撤销入口如果按最近未撤销操作栈工作，单次撤销只应移除当前操作；测试不能把“当前操作已撤销”误写成“整个历史为空”，应同时验证恢复后的数据和剩余历史语义。
- 处理：Smoke 改为允许撤销按钮继续显示，补充重新设置 / 清除批量收藏的流程后再验证最终状态；Store 单测继续覆盖撤销后无历史的单操作场景和无变化不建历史。

## 2026-08-19：重做 Smoke 要断言操作目标状态

- 现象：批量重做接口已经把三个集合恢复为“全部收藏”，Smoke 却沿用了批量撤销后的“部分收藏”期望，误报重做失败。
- 经验：撤销和重做是相反方向的状态合同；测试变量名、错误文案和断言字段必须明确区分 `undo` 的旧状态与 `redo` 的新状态，不能只复制上一段断言再改按钮操作。
- 处理：重做断言改为验证全部收藏、原归档状态保持不变，并保留 Store、IPC 和最终集合持久化检查；修正后真实 Electron Smoke 通过。

## 2026-08-19：标签重做快照要删除前后元数据并集

- 现象：标签清理撤销后再重做时，集合标签已经被清理，但撤销阶段恢复的旧标签元数据仍残留；原因是重做只删除“重做后元数据列表”，没有覆盖撤销恢复回来的旧标签。
- 经验：可逆操作的目标快照不只要描述目标状态，还要明确恢复前需要清除的状态集合；涉及删除或重命名的元数据时，清除集合应覆盖操作前后快照的标签并集。
- 处理：`redoMetadataTags` 改为操作前标签集合与重做后完整元数据标签集合的并集，重做时先删除并集再插入目标元数据；补充清理操作跨重启撤销 / 重做单测和 Electron Smoke，确认旧样式不残留。
## 2026-08-21：R2 下载镜像不能默认保留上一版本
- 现象：发布流程默认把当前版和上一版安装包同步到 R2，稳定清单也包含两版，旧版本对象持续占用 R2 空间。
- 原因：脚本的 `retention` 字段已经是 `1`，但实际执行逻辑仍寻找上一版并把它加入 `entries`，文档和实现语义没有保持一致。
- 经验：R2 只是官网低延迟下载镜像，不是历史版本存档；需要严格以存储成本约束为准，manifest、保留目录和清理逻辑必须共同只保留最新一版，历史版本统一回到 GitHub Releases。
- 处理：发布同步只上传当前版本，清理时只保留当前版本目录，并补充测试 / 文档约束，避免以后恢复“最新两版”逻辑。
## 2026-08-21：macOS --dir 构建不能假设生成 app-update.yml
- 现象：v0.6.1 安装后点击自动更新时报 `ENOENT: no such file or directory, open '/Applications/AIVPlayer.app/Contents/Resources/app-update.yml'`。
- 原因：macOS 发布流程为了先公证 `.app`，改成先执行 `electron-builder --dir --publish never`，再用 `--prepackaged` 生成 DMG / ZIP；Electron Builder 只有在 dmg / zip 目标的 afterPack 阶段才写入 `app-update.yml`，`--dir` 阶段不会生成，后续打包只是保留缺失状态。
- 经验：`latest-mac.yml` 是 GitHub Release 上的远程更新元数据，不能替代安装包内部的 `app-update.yml`。涉及分阶段签名、公证和 prepackaged 打包时，必须把运行时必需的本地配置显式写入，并纳入最终资源门禁。
- 处理：将固定的 `resources/app-update.yml` 作为 `extraResources` 在签名前放入应用，`check-packaged-resources` 同时校验配置内容，发布 v0.6.2 修复已安装应用的自动更新链路；不能在签名后再改写 `.app` 资源。

## 2026-08-21：智谱免费模型必须使用官方 API 编码

- 现象：Cloudflare Worker 初始把 BigModel 免费模型配置为 `glm-4-flash`，但用户实际指定的是文档页面对应的 `glm-4-flash-250414`，模型名称不够精确。
- 经验：接入第三方模型时，展示名称、文档页面标题和 API 请求中的 `model` 编码可能不同；不能只凭简称配置，必须以官方对话补全接口允许的模型枚举为准。
- 处理：Worker 固定改为 `glm-4-flash-250414`，同步更新健康检查、测试、部署文档和功能记录，并用真实的无敏感内容请求验证返回模型和 HTTP 200。

## 2026-08-24：Vision Pack 不能扫描任意历史目录作为当前运行时

- **问题**：内容寻址提交把 `userData/models/vision-pack/` 下所有目录都扫描一遍，找到任意一个可用目录就当成当前 Vision Pack；下载函数还在获取当前版本 manifest 之前提前返回。用户升级后如果本地留有旧 revision，就可能继续加载旧依赖，甚至永远看不到新版本下载入口。
- **原因**：内容寻址解决了“相同内容只存一份”，但没有定义“当前激活哪一份”的状态边界；本地缓存目录不能代替版本映射。
- **修复**：使用 `active.json` 记录当前版本、平台、架构和 revision；解析时只信任当前版本的 active 指针和当前版本兼容路径。下载时先获取版本 manifest，再复用目标 revision 或下载新归档，成功后原子更新 active 指针。
- **经验**：历史 revision 可以保留用于复用或回滚，但必须通过明确的 manifest / pointer 选择，不能用目录枚举结果隐式决定运行时版本。

## 2026-08-24：macOS 挂载旧 DMG 不能污染“打开方式”

- 现象：用户先后下载并挂载多个 AIVPlayer DMG 时，Finder 的视频“打开方式”同时显示 0.6.0、0.6.1 等历史版本；旧 DMG 没有被安装到 `/Applications`，但其中的 `.app` 仍被 LaunchServices 识别。
- 原因：DMG 是只读磁盘映像，挂载后其中的 `.app` 是独立 Bundle；`fileAssociations` 会让 LaunchServices 为每个 Bundle 注册视频关联。应用内自动更新只替换安装位置，无法自动注销仍挂载的历史 Bundle。
- 经验：不能把“用户会 eject DMG”当成产品前置条件；正式 macOS 应用启动时应按 Bundle ID / 版本清理其他路径的旧登记，但不能删除用户文件、卸载磁盘或注销更新版本。
- 处理：新增 LaunchServices 清理模块，扫描 `/Volumes`、`/Applications`、用户 Applications、Downloads 和 Desktop 的直接 `.app`，只对版本不高于当前版本的其他 `cn.quniv.aivplayer` Bundle 执行 `lsregister -u`，随后强制登记当前 App；开发态和 CLI 不执行，失败也不阻断启动。

## 2026-08-26：不要为了清理 LaunchServices 扫描受保护的用户目录

- 现象：正式版首次启动时，macOS 弹出 “AIVPlayer.app 想访问桌面文件夹中的文件” 的隐私授权提示。
- 原因：启动阶段的 LaunchServices 清理逻辑主动读取 `~/Desktop`，触发了 macOS 对桌面目录的 TCC 保护；这个与播放器启动无关的后台维护动作不应该要求用户授权。
- 经验：桌面应用启动时不能为了修复 Finder 的历史关联而扫描 Desktop、Downloads 等用户目录；如果一个低频清理需求会引入系统权限弹窗，应直接移除该需求，不要把权限请求转嫁给用户。
- 处理：删除启动时的 LaunchServices 自动清理逻辑、对应单元测试和发布说明；应用启动不再主动读取用户桌面或下载目录。

## 2026-08-24：Snap 发布凭据只保留一个 CI 入口

- 现象：GitHub Actions 同时配置了 `SNAPCRAFT_STORE_CREDENTIALS` 和 `SNAP_CSC_LINK`，容易误以为两者都必须注入。
- 原因：`SNAPCRAFT_STORE_CREDENTIALS` 是 Snapcraft 原生环境变量，适合直接调用 Snapcraft；`SNAP_CSC_LINK` 是 electron-builder 的 CI 入口，electron-builder 会把它转换并注入 Snapcraft 子进程。
- 经验：本项目通过 electron-builder 构建并发布 Snap，因此只保留 `SNAP_CSC_LINK`；不要把同一份凭据以两种格式重复配置，避免格式不匹配和凭据入口分叉。
- 处理：删除 GitHub Actions Secret `SNAPCRAFT_STORE_CREDENTIALS`，保留 `SNAP_CSC_LINK`；工作流继续使用 `SNAP_CSC_LINK`，仓库内不直接依赖 Snapcraft 原生变量。

## 2026-08-24：R2/CDN 上传后的完整性校验必须容忍短暂不可见

- 现象：`wrangler r2 object put` 已返回 `Upload complete`，但发布工作流立即通过公开 CDN URL 回读新上传的 Vision Pack 时返回 404，随后被误报为归档 SHA-256 不一致；等待一段时间后同一 URL 可以正常返回 200。
- 原因：R2 对象写入成功与自定义域名/CDN 边缘节点可读之间存在短暂传播窗口，上传 API 的成功响应不代表公开 URL 已经立即收敛。
- 经验：发布门禁必须继续校验远端清单和完整归档，但对刚写入对象的 404、连接失败等暂态网络错误使用有界指数退避；只有所有重试耗尽后，才能判定发布失败。归档必须先落到临时文件再计算哈希，不能依赖未启用 `pipefail` 的管道返回值。
- 处理：Vision Pack 回读增加 12 次、5 秒起步且 60 秒封顶的指数退避，并为请求增加 `no-cache`；归档先写入临时文件后执行 SHA-256 校验，避免把传播延迟或 curl 失败误报为内容损坏。

## 2026-08-24：Flathub 生成式 AI 政策决定提审策略

- 现象：调研 Flathub 上架流程时发现，其审核团队于 2026-05 起执行严格的生成式 AI 政策：包含 AI 生成或 AI 辅助代码/文档/内容的应用原则上不允许提交；提审 PR、manifest、元数据与审核回复也不得由 AI 工具生成或代办；仅有「成熟、良好维护的项目」例外。另有「开发历史不足」政策，存在时间很短的项目一般不收。
- 原因：Flathub 审核全部由志愿者承担，2025-2026 年 AI 速成应用（slop）涌入导致审核资源被击穿，团队选择一刀切止血；政策不溯及已上架应用。
- 经验：(1) 提审 Flathub 的任何材料（申请 issue、manifest PR、审核沟通）必须由项目所有者本人手写并手动操作，不能让 AI 代发，否则可能被秒拒甚至给账号留下违规记录；(2) AI 深度参与开发的项目在达到「成熟维护」标准（持续发版历史、真实用户量）之前不应尝试提交；(3) Flatpak 格式本身开放，`.flatpak` bundle 自行分发完全合规，不依赖商店审核。
- 处理：AIVPlayer 当前阶段不提交 Flathub，改为 GitHub Release + 官网直接分发 `.flatpak` bundle；建议 2027Q1 由项目所有者本人重新评估「成熟项目例外」的可行性。

## 2026-08-25：Snap 图形应用必须走 gnome extension + LXD，而不是手写 stagePackages

- 现象：Snap 在 ARM64 Ubuntu 上启动时 Wayland 初始化失败并段错误，沙箱内缺少 `dri_gbm.so`；x64 包体积 300,052,480 bytes，刚好超过 R2 REST 的 300,000,000 bytes 镜像限制。
- 原因：为绕过 GitHub Actions LXD 网络问题改用 destructive mode，代价是 gnome extension 被禁用，GTK/GL 驱动只能手写 stagePackages，且遗漏了 mesa DRI 驱动；Snap Store Listing 图标与 Snap 二进制元数据也是两条独立链路，electron-builder 不会自动上传 Listing 图标。
- 经验：(1) GUI Snap 的标准做法是 core24 + gnome extension，GTK、主题和 GL 由 `gnome-46-2404` / `mesa-2404` 内容 Snap 在运行时提供；(2) LXD 网络问题应使用 `canonical/setup-lxd` Action，不要直接放弃 LXD；(3) electron-builder 动态生成 manifest 时，使用 setup-lxd + useLXD，不要直接套用只适合仓库自带 snapcraft.yaml 的 action-buildsnap；(4) Snap 体积必须区分 MiB 与 MB，R2 限制按十进制 bytes 计算。
- 处理：Snap 构建改为 `useLXD: true` + `extensions: [gnome]`，两个架构 runner 都加入 setup-lxd；0.6.5 包体降到 amd64 240.8MB / arm64 221.9MB，R2 超限问题消失，Wayland 所需 GL 运行时由共享 content snap 提供；Listing 图标、分类、许可证、官网、源码和 Issue 已在 Snap Store 手动保存一次，后续版本发布不覆盖这些字段。

## 2026-08-25：拆分 Snap Job 时必须保证预打包 artifact 的生产顺序

- 现象：首次把 Snap 拆成独立 Job 后，Snap Job 找不到 `linux-unpacked` artifact；同时归档步骤误放入 macOS Job，导致 macOS runner 执行 `tar` 时找不到 Linux 目录。
- 原因：GitHub Actions Job 之间只通过显式 artifact 传递文件，步骤插入位置和 Job 依赖目录不能靠文件名推断；把 Linux 归档步骤放在错误 Job 会在运行时才暴露。
- 经验：拆分构建前要明确每个 artifact 的生产者、消费者和目录；普通 Linux Job 必须先上传 `linux-unpacked`，Snap Job 再下载并使用 `--prepackaged`，不能让 Snap Job重复构建，也不能把跨平台步骤放到 macOS Job。
- 处理：归档步骤移回 x64/ARM64 Linux Job，Snap Job通过 artifact 下载并使用预打包目录；保留单元测试验证 Job 名称、下载路径和 `--prepackaged` 参数。

## 2026-08-25：自动更新诊断必须区分已安装应用与工作区产物

- 现象：`/Applications/AIVPlayer.app` 自动更新报 `sha512 checksum mismatch`；排查时如果只看仓库 `release/` 目录，容易把旧的本地构建文件误认为当前应用实际使用的更新资产。
- 原因：真正运行的应用版本、其 `Contents/Resources/app-update.yml`、electron-updater 缓存和 GitHub Release 远端资产，分别位于 `/Applications`、用户 Library 和远端；工作区里的 `release/` 不能作为运行时证据。本次还发现同一个已发布的 `v0.6.4` 被 workflow_dispatch 重跑并通过 `overwrite_files: true` 删除后重新上传，导致旧 `latest-mac.yml` 缓存可能与新 macOS ZIP 混用。
- 经验：自动更新完整性问题必须先读取已安装 Bundle 版本和内置 updater 配置，再把报错中的 expected / got 与对应 Release 的历史重传记录、元数据和安装包逐一对照；已发布版本应视为不可变，不能用覆盖同一 tag / Release 资产的方式修复构建问题。
- 处理：本地保留更新缓存和应用数据不动，确认 `got` 与当前 `v0.6.4` ZIP 的 sha512 一致、当前线上元数据已收敛后再重试；后续发布失败应递增版本号重新发布，并在 workflow 中禁止对已存在 Release 执行同名资产覆盖。

## 2026-08-26：黑屏排查必须先检查用户实际安装的 App

- 现象：用户反馈 `/Applications/AIVPlayer.app` 启动后主界面黑屏；排查初期误看了工作区旧 `release/` 目录和临时下载包，没有先以用户实际安装的 Bundle 为证据。
- 原因：0.6.6 在 `AppShell` 中新增了第二个顶部状态条 `AsrModelBootstrapBanner`，但 `.app-shell` 仍只有 `grid-template-rows: 40px auto 1fr` 三行定义。第二个状态条占用了 `1fr`，真正的 `.app-surface` 落入隐式行并计算为 `0px` 高度；DOM 和 React 都正常，所以不会出现 JS 异常，只会看到黑色窗口。
- 经验：桌面应用启动问题必须按“实际安装 Bundle → 内置 asar / renderer → DevTools DOM 与计算布局 → 源码 / Git blame”顺序排查，不能用工作区 `release/` 目录替代 `/Applications` 的运行时证据；Electron 黑屏不等于渲染进程崩溃。
- 处理：布局修复应让两个状态条各占一行，并给播放器主体显式的剩余空间，例如将 `.app-shell` 的行模板调整为 `40px auto auto minmax(0, 1fr)`；同时补充启动 Smoke，断言 `.app-surface` 在无媒体和模型下载状态下仍有正高度。

## 2026-08-28：设置滚动 Grid 的自动行不能分配剩余高度

- 现象：AI 服务设置页的多个卡片之间出现异常大的垂直空白，页面内容看起来非常稀疏；其他设置页没有同样问题。
- 原因：`.settings-grid` 是可滚动且被 `align-self: stretch` 拉满高度的 Grid。AI 服务独立设置组件由 `effa4220` 引入，返回多个顶层节点而不是统一的 `.settings-card` 外壳；Grid 的默认 `align-content: normal` 会把剩余高度分配给这些自动行，导致每个 `gap: 12px` 之外又产生大段空白。
- 经验：滚动 Grid 既要保持容器拉伸和 `overflow-y: auto`，又要显式设置 `align-content: start`；`align-items: start` 只控制行内项目对齐，不能阻止自动行轨道被拉伸。新增设置分类时要检查组件是否返回单一面板根节点，或验证多根节点在实际窗口高度下的计算布局。
- 处理：为 `.settings-grid` 增加 `align-content: start`，让多根设置项按内容高度排列并保留 12px 间距；在设置 UI 源码约束中增加防回归断言。
