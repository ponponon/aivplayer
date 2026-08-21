const STORAGE_KEY = 'aivplayer-site-language'
const DOWNLOAD_MANIFEST_URL = 'https://releases.quniv.cn/aivplayer/releases/download-manifest.json'
const GITHUB_RELEASES_URL = 'https://github.com/ponponon/aivplayer/releases'
const GITHUB_RELEASE_DOWNLOAD_BASE = 'https://github.com/ponponon/aivplayer/releases/download'

const platformCopyKeys = { darwin: 'macos', win32: 'windows', linux: 'linux' }
const platformIconSvgs = {
  // Apple mark from Simple Icons (CC0): https://github.com/simple-icons/simple-icons/blob/develop/icons/apple.svg
  darwin: '<path d="M12.152 6.896c-.948 0-2.415-1.078-3.96-1.04-2.04.027-3.91 1.183-4.961 3.014-2.117 3.675-.546 9.103 1.519 12.09 1.013 1.454 2.208 3.09 3.792 3.039 1.52-.065 2.09-.987 3.935-.987 1.831 0 2.35.987 3.96.948 1.637-.026 2.676-1.48 3.676-2.948 1.156-1.688 1.636-3.325 1.662-3.415-.039-.013-3.182-1.221-3.22-4.857-.026-3.04 2.48-4.494 2.597-4.559-1.429-2.09-3.623-2.324-4.39-2.376-2-.156-3.675 1.09-4.61 1.09zM15.53 3.83c.843-1.012 1.4-2.427 1.245-3.83-1.207.052-2.662.805-3.532 1.818-.78.896-1.454 2.338-1.273 3.714 1.338.104 2.715-.688 3.559-1.701" />',
  win32: '<path d="M3 5.2 10.8 4v7.2H3V5.2Zm9.2-1.4L21 2.5v8.7h-8.8V3.8ZM3 12.8h7.8V20L3 18.8v-6Zm9.2 0H21v8.7l-8.8-1.3v-7.4Z" />',
  // Tux penguin from Simple Icons (CC0): https://github.com/simple-icons/simple-icons/blob/develop/icons/linux.svg
  linux: '<path d="M12.504 0c-.155 0-.315.008-.48.021-4.226.333-3.105 4.807-3.17 6.298-.076 1.092-.3 1.953-1.05 3.02-.885 1.051-2.127 2.75-2.716 4.521-.278.832-.41 1.684-.287 2.489a.424.424 0 00-.11.135c-.26.268-.45.6-.663.839-.199.199-.485.267-.797.4-.313.136-.658.269-.864.68-.09.189-.136.394-.132.602 0 .199.027.4.055.536.058.399.116.728.04.97-.249.68-.28 1.145-.106 1.484.174.334.535.47.94.601.81.2 1.91.135 2.774.6.926.466 1.866.67 2.616.47.526-.116.97-.464 1.208-.946.587-.003 1.23-.269 2.26-.334.699-.058 1.574.267 2.577.2.025.134.063.198.114.333l.003.003c.391.778 1.113 1.132 1.884 1.071.771-.06 1.592-.536 2.257-1.306.631-.765 1.683-1.084 2.378-1.503.348-.199.629-.469.649-.853.023-.4-.2-.811-.714-1.376v-.097l-.003-.003c-.17-.2-.25-.535-.338-.926-.085-.401-.182-.786-.492-1.046h-.003c-.059-.054-.123-.067-.188-.135a.357.357 0 00-.19-.064c.431-1.278.264-2.55-.173-3.694-.533-1.41-1.465-2.638-2.175-3.483-.796-1.005-1.576-1.957-1.56-3.368.026-2.152.236-6.133-3.544-6.139zm.529 3.405h.013c.213 0 .396.062.584.198.19.135.33.332.438.533.105.259.158.459.166.724 0-.02.006-.04.006-.06v.105a.086.086 0 01-.004-.021l-.004-.024a1.807 1.807 0 01-.15.706.953.953 0 01-.213.335.71.71 0 00-.088-.042c-.104-.045-.198-.064-.284-.133a1.312 1.312 0 00-.22-.066c.05-.06.146-.133.183-.198.053-.128.082-.264.088-.402v-.02a1.21 1.21 0 00-.061-.4c-.045-.134-.101-.2-.183-.333-.084-.066-.167-.132-.267-.132h-.016c-.093 0-.176.03-.262.132a.8.8 0 00-.205.334 1.18 1.18 0 00-.09.4v.019c.002.089.008.179.02.267-.193-.067-.438-.135-.607-.202a1.635 1.635 0 01-.018-.2v-.02a1.772 1.772 0 01.15-.768c.082-.22.232-.406.43-.533a.985.985 0 01.594-.2zm-2.962.059h.036c.142 0 .27.048.399.135.146.129.264.288.344.465.09.199.14.4.153.667v.004c.007.134.006.2-.002.266v.08c-.03.007-.056.018-.083.024-.152.055-.274.135-.393.2.012-.09.013-.18.003-.267v-.015c-.012-.133-.04-.2-.082-.333a.613.613 0 00-.166-.267.248.248 0 00-.183-.064h-.021c-.071.006-.13.04-.186.132a.552.552 0 00-.12.27.944.944 0 00-.023.33v.015c.012.135.037.2.08.334.046.134.098.2.166.268.01.009.02.018.034.024-.07.057-.117.07-.176.136a.304.304 0 01-.131.068 2.62 2.62 0 01-.275-.402 1.772 1.772 0 01-.155-.667 1.759 1.759 0 01.08-.668 1.43 1.43 0 01.283-.535c.128-.133.26-.2.418-.2zm1.37 1.706c.332 0 .733.065 1.216.399.293.2.523.269 1.052.468h.003c.255.136.405.266.478.399v-.131a.571.571 0 01.016.47c-.123.31-.516.643-1.063.842v.002c-.268.135-.501.333-.775.465-.276.135-.588.292-1.012.267a1.139 1.139 0 01-.448-.067 3.566 3.566 0 01-.322-.198c-.195-.135-.363-.332-.612-.465v-.005h-.005c-.4-.246-.616-.512-.686-.71-.07-.268-.005-.47.193-.6.224-.135.38-.271.483-.336.104-.074.143-.102.176-.131h.002v-.003c.169-.202.436-.47.839-.601.139-.036.294-.065.466-.065zm2.8 2.142c.358 1.417 1.196 3.475 1.735 4.473.286.534.855 1.659 1.102 3.024.156-.005.33.018.513.064.646-1.671-.546-3.467-1.089-3.966-.22-.2-.232-.335-.123-.335.59.534 1.365 1.572 1.646 2.757.13.535.16 1.104.021 1.67.067.028.135.06.205.067 1.032.534 1.413.938 1.23 1.537v-.043c-.06-.003-.12 0-.18 0h-.016c.151-.467-.182-.825-1.065-1.224-.915-.4-1.646-.336-1.77.465-.008.043-.013.066-.018.135-.068.023-.139.053-.209.064-.43.268-.662.669-.793 1.187-.13.533-.17 1.156-.205 1.869v.003c-.02.334-.17.838-.319 1.35-1.5 1.072-3.58 1.538-5.348.334a2.645 2.645 0 00-.402-.533 1.45 1.45 0 00-.275-.333c.182 0 .338-.03.465-.067a.615.615 0 00.314-.334c.108-.267 0-.697-.345-1.163-.345-.467-.931-.995-1.788-1.521-.63-.4-.986-.87-1.15-1.396-.165-.534-.143-1.085-.015-1.645.245-1.07.873-2.11 1.274-2.763.107-.065.037.135-.408.974-.396.751-1.14 2.497-.122 3.854a8.123 8.123 0 01.647-2.876c.564-1.278 1.743-3.504 1.836-5.268.048.036.217.135.289.202.218.133.38.333.59.465.21.201.477.335.876.335.039.003.075.006.11.006.412 0 .73-.134.997-.268.29-.134.52-.334.74-.4h.005c.467-.135.835-.402 1.044-.7zm2.185 8.958c.037.6.343 1.245.882 1.377.588.134 1.434-.333 1.791-.765l.211-.01c.315-.007.577.01.847.268l.003.003c.208.199.305.53.391.876.085.4.154.78.409 1.066.486.527.645.906.636 1.14l.003-.007v.018l-.003-.012c-.015.262-.185.396-.498.595-.63.401-1.746.712-2.457 1.57-.618.737-1.37 1.14-2.036 1.191-.664.053-1.237-.2-1.574-.898l-.005-.003c-.21-.4-.12-1.025.056-1.69.176-.668.428-1.344.463-1.897.037-.714.076-1.335.195-1.814.12-.465.308-.797.641-.984l.045-.022zm-10.814.049h.01c.053 0 .105.005.157.014.376.055.706.333 1.023.752l.91 1.664.003.003c.243.533.754 1.064 1.189 1.637.434.598.77 1.131.729 1.57v.006c-.057.744-.48 1.148-1.125 1.294-.645.135-1.52.002-2.395-.464-.968-.536-2.118-.469-2.857-.602-.369-.066-.61-.2-.723-.4-.11-.2-.113-.602.123-1.23v-.004l.002-.003c.117-.334.03-.752-.027-1.118-.055-.401-.083-.71.043-.94.16-.334.396-.4.69-.533.294-.135.64-.202.915-.47h.002v-.002c.256-.268.445-.601.668-.838.19-.201.38-.336.663-.336zm7.159-9.074c-.435.201-.945.535-1.488.535-.542 0-.97-.267-1.28-.466-.154-.134-.28-.268-.373-.335-.164-.134-.144-.333-.074-.333.109.016.129.134.199.2.096.066.215.2.36.333.292.2.68.467 1.167.467.485 0 1.053-.267 1.398-.466.195-.135.445-.334.648-.467.156-.136.149-.267.279-.267.128.016.034.134-.147.332a8.097 8.097 0 01-.69.468zm-1.082-1.583V5.64c-.006-.02.013-.042.029-.05.074-.043.18-.027.26.004.063 0 .16.067.15.135-.006.049-.085.066-.135.066-.055 0-.092-.043-.141-.068-.052-.018-.146-.008-.163-.065zm-.551 0c-.02.058-.113.049-.166.066-.047.025-.086.068-.14.068-.05 0-.13-.02-.136-.068-.01-.066.088-.133.15-.133.08-.031.184-.047.259-.005.019.009.036.03.03.05v.02h.003z" />'
}
const architectureIconSvg = '<rect x="7" y="7" width="10" height="10" rx="2" /><path d="M9 1v4M15 1v4M9 19v4M15 19v4M1 9h4M1 15h4M19 9h4M19 15h4" />'
const historyIconSvg = '<path d="M4 6.5h16v14H4z" /><path d="M8 3.5v5M16 3.5v5M4 11h16M8 15h3M13 15h3M8 18h3" />'

function createDownloadIcon(svg, className = 'download-option-icon') {
  const icon = document.createElement('span')
  icon.className = className
  icon.innerHTML = `<svg viewBox="0 0 24 24" aria-hidden="true">${svg}</svg>`
  return icon
}

function createPlatformIcon(platform, className = 'download-option-icon') {
  return createDownloadIcon(platformIconSvgs[platform] ?? architectureIconSvg, className)
}

function createGithubAssetUrl(version, fileName) {
  return `${GITHUB_RELEASE_DOWNLOAD_BASE}/v${version}/${encodeURIComponent(fileName)}`
}

const FALLBACK_DOWNLOAD_MANIFEST = {
  schemaVersion: 1,
  releases: [{
    version: '0.6.2',
    tag: 'v0.6.2',
    githubUrl: `${GITHUB_RELEASES_URL}/tag/v0.6.2`,
    assets: {
      'darwin-arm64': { name: 'AIVPlayer-0.6.2-arm64.dmg', url: createGithubAssetUrl('0.6.2', 'AIVPlayer-0.6.2-arm64.dmg'), format: 'dmg' },
      'win32-x64': { name: 'AIVPlayer-Setup-0.6.2-x64.exe', url: createGithubAssetUrl('0.6.2', 'AIVPlayer-Setup-0.6.2-x64.exe'), format: 'exe' },
      'win32-arm64': { name: 'AIVPlayer-Setup-0.6.2-arm64.exe', url: createGithubAssetUrl('0.6.2', 'AIVPlayer-Setup-0.6.2-arm64.exe'), format: 'exe' },
      'linux-x64': {
        appimage: { name: 'aivplayer-0.6.2-x86_64.AppImage', url: createGithubAssetUrl('0.6.2', 'aivplayer-0.6.2-x86_64.AppImage'), format: 'AppImage' },
        deb: { name: 'aivplayer-0.6.2-amd64.deb', url: createGithubAssetUrl('0.6.2', 'aivplayer-0.6.2-amd64.deb'), format: 'deb' }
      },
      'linux-arm64': {
        appimage: { name: 'aivplayer-0.6.2-arm64.AppImage', url: createGithubAssetUrl('0.6.2', 'aivplayer-0.6.2-arm64.AppImage'), format: 'AppImage' },
        deb: { name: 'aivplayer-0.6.2-arm64.deb', url: createGithubAssetUrl('0.6.2', 'aivplayer-0.6.2-arm64.deb'), format: 'deb' }
      }
    }
  }, {
    version: '0.5.6',
    tag: 'v0.5.6',
    githubUrl: `${GITHUB_RELEASES_URL}/tag/v0.5.6`,
    assets: {
      'darwin-arm64': { name: 'AIVPlayer-0.5.6-arm64.dmg', url: createGithubAssetUrl('0.5.6', 'AIVPlayer-0.5.6-arm64.dmg'), format: 'dmg' },
      'win32-x64': { name: 'AIVPlayer-Setup-0.5.6-x64.exe', url: createGithubAssetUrl('0.5.6', 'AIVPlayer-Setup-0.5.6-x64.exe'), format: 'exe' },
      'win32-arm64': { name: 'AIVPlayer-Setup-0.5.6-arm64.exe', url: createGithubAssetUrl('0.5.6', 'AIVPlayer-Setup-0.5.6-arm64.exe'), format: 'exe' },
      'linux-x64': {
        appimage: { name: 'aivplayer-0.5.6-x86_64.AppImage', url: createGithubAssetUrl('0.5.6', 'aivplayer-0.5.6-x86_64.AppImage'), format: 'AppImage' },
        deb: { name: 'aivplayer-0.5.6-amd64.deb', url: createGithubAssetUrl('0.5.6', 'aivplayer-0.5.6-amd64.deb'), format: 'deb' }
      },
      'linux-arm64': {
        appimage: { name: 'aivplayer-0.5.6-arm64.AppImage', url: createGithubAssetUrl('0.5.6', 'aivplayer-0.5.6-arm64.AppImage'), format: 'AppImage' },
        deb: { name: 'aivplayer-0.5.6-arm64.deb', url: createGithubAssetUrl('0.5.6', 'aivplayer-0.5.6-arm64.deb'), format: 'deb' }
      }
    }
  }]
}

let selectedDownloadTarget = { platform: null, architecture: null }
let manualDownloadTargetSelected = false
let selectedHistoryVersion = null

const copy = {
  'zh-CN': {
    a11y: { skip: '跳到主要内容' },
    language: { label: '语言', auto: '跟随系统' },
    nav: { features: '功能', workflow: '工作流', preview: '界面预览', download: '下载', docs: '文档' },
    hero: { eyebrow: '本地优先 · 为视频而生', title: '你的本地 AI<br><em>视频工作台。</em>', lede: 'AIVPlayer 把播放、字幕、视觉检索和剪辑收进一款专注的桌面应用。媒体和项目默认留在你的设备上。', primary: '下载 AIVPlayer', secondary: '查看功能', localNote: '本地运行，无需账号。', mediaCaption: '真实界面 · 截取自 AIVPlayer 0.6.1' },
    signals: { local: '本地优先处理', languages: '简体中文 · English · 日本語 · 한국어', platforms: 'macOS · Windows · Linux' },
    features: { eyebrow: '一款应用，完成整条工作流', title: '少切换工具。<br><em>把时间留给内容。</em>', lede: 'AIVPlayer 让高频视频工作保持连贯：观看、理解、选段和创作，都不必把媒体库交给云端。', subtitle: { title: '字幕始终在身边', body: '用 whisper.cpp 在本地生成字幕；需要时通过 OpenAI 兼容服务翻译，并导出干净的外挂字幕文件。' }, search: { title: '找到你记得的画面', body: '使用 SigLIP2 和 LanceDB 建立本地视觉影视库。按文字或图片搜索，直接跳到匹配的时间点。' }, edit: { title: '把选段变成工作', body: '在同一个本地工作区里使用 Clip Inbox、多轨剪辑、字幕、图片工具和 AI 短剧文本创作。' } },
    workflow: { eyebrow: '更清晰的剪辑路径', title: '从导入<br>到洞察。', lede: '每一步都有自己的位置，文件和决定仍然由你掌控。', link: '阅读工作流文档', import: { title: '导入', body: '打开视频、图片、Live Photo 或音频，媒体库留在本机。' }, understand: { title: '理解', body: '按需生成字幕、摘要、章节和视觉证据。' }, shape: { title: '创作', body: '收集片段、调整字幕、处理图片，并在时间线上剪辑。' }, export: { title: '导出', body: '导出片段、字幕和工程，也可以在局域网共享 Web 播放器。' } },
    preview: { eyebrow: '不是占位图', title: '先看看工作区<br><em>真实的样子。</em>', lede: '以下都是桌面端真实截图，不是占位符。界面深色、适合键盘操作，并围绕当前媒体展开。', playerAlt: 'AIVPlayer 显示视频和字幕生成面板', settingsAlt: 'AIVPlayer 偏好设置窗口，显示界面语言设置', playerTitle: '播放 + 字幕工作区', playerCaption: '观看、跳转、检查运行状态，并在一个界面准备本地 ASR。', settingsTitle: '尊重你的使用方式', settingsCaption: '语言、文件夹、播放、截图录屏、快捷键和 AI 服务都可以配置。' },
    quickstart: { eyebrow: '无需复杂仪式', title: '打开视频。<br><em>继续工作。</em>', lede: '安装包自带核心播放和媒体运行时。可选 AI 模型只会在你主动使用时下载。', engine: { title: '安装应用', body: '下载对应系统的安装包，打开你的第一个文件。' }, model: { title: '需要时再添加模型', body: '在应用内选择模型来源，不会静默下载大文件。' }, ai: { title: '按你的方式连接 AI', body: '翻译和生成使用你配置的地址和密钥，不需要 AIVPlayer 账号。' } },
    download: { eyebrow: '准备好时再开始', title: '为你的电脑下载 AIVPlayer。', lede: '为你的系统选择安装包，应用完全在本地运行——不需要账号，不会上传文件。', recommendedLabel: '为这台电脑推荐', downloadRecommended: '下载推荐版本', downloadFor: '下载 {platform} 版', chooserLabel: '或选择其他平台', architectureLabel: '构建', formatLabel: '格式', historyVersionLabel: '版本', versionLatest: '最新版本（{version}）', downloadSelected: '下载这个构建', archiveBody: '更早的版本保留在 GitHub Releases。', archiveLink: '查看全部版本', detected: '已检测到', unavailable: '该架构目前没有安装包。', architectureUnknown: '浏览器无法可靠确认架构，请手动选择。', choosePlatform: '请在下方选择平台开始下载。', unavailableTag: '暂无', macos: 'macOS', windows: 'Windows', linux: 'Linux', arm64: 'ARM64', x64: 'x64', privacyBody: '你的文件、工程、字幕和索引默认保存在本地。', privacyLink: '阅读完整隐私政策', arch: { darwin: { arm64: 'Apple 芯片', x64: 'Intel' }, win32: { x64: '标准版（x64）', arm64: 'ARM64' }, linux: { x64: 'x64', arm64: 'ARM64' } } },
    footer: { tagline: '为认真处理动态影像的人准备的本地 AI 视频工作台。', docs: '使用文档', privacy: '隐私政策', issues: '反馈问题', note: '为与影像一起工作的人而造。' }
  },
  'en-US': {
    a11y: { skip: 'Skip to content' },
    language: { label: 'Language', auto: 'Auto' },
    nav: { features: 'Features', workflow: 'Workflow', preview: 'Preview', download: 'Download', docs: 'Docs' },
    hero: { eyebrow: 'PRIVATE BY DEFAULT · BUILT FOR VIDEO', title: 'Your local AI<br><em>video workspace.</em>', lede: 'AIVPlayer brings playback, subtitles, visual search, and editing into one focused desktop app. Your media and projects stay on your machine by default.', primary: 'Download AIVPlayer', secondary: 'Explore features', localNote: 'Runs locally. No account required.', mediaCaption: 'Real interface · captured from AIVPlayer 0.6.1' },
    signals: { local: 'Local-first processing', languages: '中文 · English · 日本語 · 한국어', platforms: 'macOS · Windows · Linux' },
    features: { eyebrow: 'ONE APP, THE WHOLE CUT', title: 'Less tool switching.<br><em>More time with the story.</em>', lede: 'AIVPlayer keeps the everyday video workflow close: watch, understand, select, and shape without handing your library to a cloud service.', subtitle: { title: 'Subtitles that stay close', body: 'Generate local subtitles with whisper.cpp, translate through an OpenAI-compatible service when you choose, and export the result as a clean sidecar file.' }, search: { title: 'Find the frame you remember', body: 'Build a local visual library with SigLIP2 and LanceDB. Search by words or an image, then jump straight to the matching moment.' }, edit: { title: 'Turn selections into work', body: 'Use Clip Inbox, multi-track editing, captions, image tools, and AI short-drama writing in the same local workspace.' } },
    workflow: { eyebrow: 'A CLEARER CUT', title: 'From import<br>to insight.', lede: 'The app gives every stage a place, while keeping the files and decisions under your control.', link: 'Read the workflow docs', import: { title: 'Import', body: 'Open video, images, Live Photos, or audio and keep the library on disk.' }, understand: { title: 'Understand', body: 'Generate subtitles, summaries, chapters, and visual evidence when you need them.' }, shape: { title: 'Shape', body: 'Collect clips, refine captions, adjust images, and edit on a timeline.' }, export: { title: 'Export', body: 'Export clips, subtitles, projects, and share a local web player on your network.' } },
    preview: { eyebrow: 'NO MOCKUPS', title: 'See the workspace<br><em>as it really is.</em>', lede: 'These are direct captures from the desktop app, not placeholders. The interface is dark, keyboard-friendly, and designed around the media in front of you.', playerAlt: 'AIVPlayer showing a video and subtitle generation panel', settingsAlt: 'AIVPlayer preferences window showing interface language settings', playerTitle: 'Playback + subtitle workspace', playerCaption: 'Watch, seek, inspect engine readiness, and prepare local ASR in one view.', settingsTitle: 'Preferences that respect your setup', settingsCaption: 'Language, folders, playback, capture, shortcuts, and AI services stay configurable.' },
    quickstart: { eyebrow: 'START WITHOUT THE RITUAL', title: 'Open a video.<br><em>Keep going.</em>', lede: 'The packaged app includes the core playback and media runtime. Optional AI models are downloaded only when you ask for them.', engine: { title: 'Install the app', body: 'Download the package for your operating system and open your first file.' }, model: { title: 'Add a model when needed', body: 'Choose a model source inside the app. Nothing large is downloaded silently.' }, ai: { title: 'Connect AI on your terms', body: 'Translation and generation use the endpoint and key you configure, not an AIVPlayer account.' } },
    download: { eyebrow: 'READY WHEN YOU ARE', title: 'Download AIVPlayer for your computer.', lede: 'Pick the installer for your operating system. The app runs locally — no account, no upload.', recommendedLabel: 'Recommended for this computer', downloadRecommended: 'Download recommended build', downloadFor: 'Download for {platform}', chooserLabel: 'Or pick another platform', architectureLabel: 'Build', formatLabel: 'Format', historyVersionLabel: 'Version', versionLatest: 'Latest ({version})', downloadSelected: 'Download this build', archiveBody: 'Older versions stay available on GitHub Releases.', archiveLink: 'View all releases', detected: 'Detected', unavailable: 'That architecture does not have an installer yet.', architectureUnknown: 'Your browser cannot reliably confirm the architecture. Choose it manually.', choosePlatform: 'Choose a platform below to start your download.', unavailableTag: 'Soon', macos: 'macOS', windows: 'Windows', linux: 'Linux', arm64: 'ARM64', x64: 'x64', privacyBody: 'Your files, projects, subtitles and indexes stay on your device by default.', privacyLink: 'Read the privacy policy', arch: { darwin: { arm64: 'Apple silicon', x64: 'Intel' }, win32: { x64: 'Standard (x64)', arm64: 'ARM64' }, linux: { x64: 'x64', arm64: 'ARM64' } } },
    footer: { tagline: 'A local AI video workspace for thoughtful editing.', docs: 'Documentation', privacy: 'Privacy', issues: 'Report an issue', note: 'Built for people who work with moving images.' }
  },
  'ja-JP': {
    a11y: { skip: '本文へ移動' },
    language: { label: '言語', auto: 'システムに合わせる' },
    nav: { features: '機能', workflow: 'ワークフロー', preview: '画面プレビュー', download: 'ダウンロード', docs: 'ドキュメント' },
    hero: { eyebrow: 'ローカル優先 · 映像のために', title: 'あなたのローカル AI<br><em>ビデオワークスペース。</em>', lede: 'AIVPlayer は再生、字幕、ビジュアル検索、編集をひとつのデスクトップアプリにまとめます。メディアとプロジェクトは標準で端末内に保存されます。', primary: 'AIVPlayer をダウンロード', secondary: '機能を見る', localNote: 'ローカルで動作。アカウント不要。', mediaCaption: '実際の画面 · AIVPlayer 0.6.1 で撮影' },
    signals: { local: 'ローカル優先の処理', languages: '简体中文 · English · 日本語 · 한국어', platforms: 'macOS · Windows · Linux' },
    features: { eyebrow: 'ひとつのアプリで、一本を仕上げる', title: 'ツールの切り替えを減らし、<br><em>物語に向き合う時間を。</em>', lede: '見る、理解する、選ぶ、形にする。ライブラリをクラウドサービスに預けず、日々の映像作業をひとつにつなぎます。', subtitle: { title: 'そばにある字幕', body: 'whisper.cpp で字幕をローカル生成。必要なときだけ OpenAI 互換サービスで翻訳し、サイドカーファイルとして書き出せます。' }, search: { title: '覚えているフレームを探す', body: 'SigLIP2 と LanceDB でローカルのビジュアルライブラリを構築。言葉や画像で検索して、その瞬間へ移動できます。' }, edit: { title: '選んだ素材を仕事にする', body: 'Clip Inbox、マルチトラック編集、字幕、画像ツール、AI 短編ドラマの文章制作を同じワークスペースで。' } },
    workflow: { eyebrow: 'わかりやすい編集の流れ', title: '読み込みから<br>インサイトへ。', lede: '各ステージに居場所を作りながら、ファイルと判断はあなたの手元に残します。', link: 'ワークフローのドキュメント', import: { title: '読み込む', body: '動画、画像、Live Photo、音声を開き、ライブラリを端末に保ちます。' }, understand: { title: '理解する', body: '必要なときに字幕、要約、チャプター、視覚エビデンスを生成します。' }, shape: { title: '形にする', body: 'クリップを集め、字幕を整え、画像を調整し、タイムラインで編集します。' }, export: { title: '書き出す', body: 'クリップ、字幕、プロジェクトを出力し、ローカル Web プレーヤーも共有できます。' } },
    preview: { eyebrow: 'モックアップではありません', title: 'ワークスペースを<br><em>実際の画面で。</em>', lede: 'デスクトップアプリを直接撮影した画面です。暗いテーマ、キーボード操作、目の前のメディアを中心に設計されています。', playerAlt: '動画と字幕生成パネルを表示した AIVPlayer', settingsAlt: 'インターフェース言語設定を表示した AIVPlayer の環境設定', playerTitle: '再生 + 字幕ワークスペース', playerCaption: '再生、シーク、エンジン状態の確認、ローカル ASR の準備をひとつの画面で。', settingsTitle: '使い方に合わせる環境設定', settingsCaption: '言語、フォルダ、再生、キャプチャ、ショートカット、AI サービスを設定できます。' },
    quickstart: { eyebrow: '面倒な手順なしで始める', title: '動画を開く。<br><em>そのまま続ける。</em>', lede: 'パッケージには再生とメディアの基本ランタイムが含まれます。AI モデルは必要なときだけダウンロードします。', engine: { title: 'アプリをインストール', body: 'OS に合うパッケージをダウンロードして、最初のファイルを開きます。' }, model: { title: '必要なときにモデルを追加', body: 'アプリ内でモデルソースを選択。大きなファイルを勝手にダウンロードしません。' }, ai: { title: '自分の方法で AI に接続', body: '翻訳と生成には設定したエンドポイントとキーを使い、AIVPlayer アカウントは必要ありません。' } },
    download: { eyebrow: '準備ができたら', title: 'あなたのパソコンに AIVPlayer をダウンロード。', lede: 'お使いのオペレーティングシステムに合わせてインストーラーを選んでください。アプリはローカルで動作し、アカウントやアップロードは不要です。', recommendedLabel: 'このパソコン向けのおすすめ', downloadRecommended: 'おすすめのビルドをダウンロード', downloadFor: '{platform} 版をダウンロード', chooserLabel: 'または他のプラットフォームを選択', architectureLabel: 'ビルド', formatLabel: 'フォーマット', historyVersionLabel: 'バージョン', versionLatest: '最新（{version}）', downloadSelected: 'このビルドをダウンロード', archiveBody: '古いバージョンは GitHub Releases にあります。', archiveLink: 'すべてのリリースを見る', detected: '検出', unavailable: 'このアーキテクチャ用のインストーラーはまだありません。', architectureUnknown: 'ブラウザではアーキテクチャを確実に確認できません。手動で選択してください。', choosePlatform: '下のプラットフォームを選んでダウンロードを開始してください。', unavailableTag: '準備中', macos: 'macOS', windows: 'Windows', linux: 'Linux', arm64: 'ARM64', x64: 'x64', privacyBody: 'ファイル、プロジェクト、字幕、インデックスは標準でローカルに残ります。', privacyLink: 'プライバシーポリシーを読む', arch: { darwin: { arm64: 'Apple シリコン', x64: 'Intel' }, win32: { x64: '標準（x64）', arm64: 'ARM64' }, linux: { x64: 'x64', arm64: 'ARM64' } } },
    footer: { tagline: '動く映像と丁寧に向き合うためのローカル AI ビデオワークスペース。', docs: 'ドキュメント', privacy: 'プライバシー', issues: '問題を報告', note: '映像とともに働く人のために。' }
  },
  'ko-KR': {
    a11y: { skip: '본문으로 이동' },
    language: { label: '언어', auto: '시스템에 맞추기' },
    nav: { features: '기능', workflow: '워크플로', preview: '화면 미리보기', download: '다운로드', docs: '문서' },
    hero: { eyebrow: '로컬 우선 · 영상을 위해 설계', title: '당신의 로컬 AI<br><em>비디오 워크스페이스.</em>', lede: 'AIVPlayer는 재생, 자막, 시각 검색, 편집을 하나의 집중된 데스크톱 앱으로 묶습니다. 미디어와 프로젝트는 기본적으로 기기에 보관됩니다.', primary: 'AIVPlayer 다운로드', secondary: '기능 살펴보기', localNote: '로컬에서 실행됩니다. 계정이 필요 없습니다.', mediaCaption: '실제 인터페이스 · AIVPlayer 0.6.1에서 캡처' },
    signals: { local: '로컬 우선 처리', languages: '简体中文 · English · 日本語 · 한국어', platforms: 'macOS · Windows · Linux' },
    features: { eyebrow: '하나의 앱으로 전체 컷을', title: '도구 전환은 줄이고,<br><em>이야기에 더 집중하세요.</em>', lede: '보고, 이해하고, 고르고, 다듬는 흐름을 클라우드 서비스에 라이브러리를 맡기지 않고 한곳에 유지합니다.', subtitle: { title: '곁에 두는 자막', body: 'whisper.cpp로 로컬 자막을 만들고, 원할 때만 OpenAI 호환 서비스로 번역한 뒤 깔끔한 사이드카 파일로 내보냅니다.' }, search: { title: '기억하는 프레임 찾기', body: 'SigLIP2와 LanceDB로 로컬 시각 라이브러리를 만듭니다. 단어나 이미지로 검색하고 일치하는 순간으로 바로 이동하세요.' }, edit: { title: '선택을 작업으로 바꾸기', body: 'Clip Inbox, 멀티트랙 편집, 캡션, 이미지 도구, AI 숏드라마 글쓰기를 같은 로컬 워크스페이스에서 사용하세요.' } },
    workflow: { eyebrow: '더 선명한 편집 흐름', title: '가져오기에서<br>인사이트까지.', lede: '각 단계에 자리를 마련하면서 파일과 결정은 당신의 통제 아래 둡니다.', link: '워크플로 문서 읽기', import: { title: '가져오기', body: '영상, 이미지, Live Photo, 오디오를 열고 라이브러리를 디스크에 보관합니다.' }, understand: { title: '이해하기', body: '필요할 때 자막, 요약, 챕터, 시각 증거를 생성합니다.' }, shape: { title: '다듬기', body: '클립을 모으고 캡션을 정리하고 이미지를 조정하며 타임라인에서 편집합니다.' }, export: { title: '내보내기', body: '클립, 자막, 프로젝트를 내보내고 로컬 웹 플레이어를 네트워크에서 공유합니다.' } },
    preview: { eyebrow: '목업이 아닙니다', title: '워크스페이스를<br><em>있는 그대로 보세요.</em>', lede: '데스크톱 앱에서 직접 캡처한 화면입니다. 어둡고 키보드 친화적이며 지금 보고 있는 미디어를 중심으로 설계되었습니다.', playerAlt: '영상과 자막 생성 패널을 보여주는 AIVPlayer', settingsAlt: '인터페이스 언어 설정을 보여주는 AIVPlayer 환경설정', playerTitle: '재생 + 자막 워크스페이스', playerCaption: '재생하고 탐색하고 엔진 상태를 확인하며 로컬 ASR을 한 화면에서 준비합니다.', settingsTitle: '사용 방식에 맞는 환경설정', settingsCaption: '언어, 폴더, 재생, 캡처, 단축키, AI 서비스를 설정할 수 있습니다.' },
    quickstart: { eyebrow: '복잡한 의식 없이 시작', title: '영상을 여세요.<br><em>계속 작업하세요.</em>', lede: '패키지 앱에는 핵심 재생 및 미디어 런타임이 포함됩니다. 선택적 AI 모델은 요청할 때만 다운로드됩니다.', engine: { title: '앱 설치', body: '운영체제에 맞는 패키지를 내려받고 첫 파일을 엽니다.' }, model: { title: '필요할 때 모델 추가', body: '앱 안에서 모델 소스를 선택하세요. 큰 파일을 몰래 다운로드하지 않습니다.' }, ai: { title: '원하는 방식으로 AI 연결', body: '번역과 생성은 설정한 엔드포인트와 키를 사용하며 AIVPlayer 계정은 필요하지 않습니다.' } },
    download: { eyebrow: '준비되었을 때', title: '당신의 컴퓨터에 AIVPlayer를 다운로드하세요.', lede: '운영체제에 맞는 설치 프로그램을 선택하세요. 앱은 로컬에서 실행되며 계정이나 업로드가 필요하지 않습니다.', recommendedLabel: '이 컴퓨터에 권장', downloadRecommended: '권장 빌드 다운로드', downloadFor: '{platform}용 다운로드', chooserLabel: '또 다른 플랫폼 선택', architectureLabel: '빌드', formatLabel: '포맷', historyVersionLabel: '버전', versionLatest: '최신 ({version})', downloadSelected: '이 빌드 다운로드', archiveBody: '이전 버전은 GitHub Releases에서 확인할 수 있습니다.', archiveLink: '모든 릴리스 보기', detected: '감지됨', unavailable: '이 아키텍처용 설치 프로그램이 아직 없습니다.', architectureUnknown: '브라우저에서 아키텍처를 확실하게 확인할 수 없습니다. 직접 선택해 주세요.', choosePlatform: '아래에서 플랫폼을 선택해 다운로드를 시작하세요.', unavailableTag: '준비 중', macos: 'macOS', windows: 'Windows', linux: 'Linux', arm64: 'ARM64', x64: 'x64', privacyBody: '파일, 프로젝트, 자막, 인덱스는 기본적으로 로컬에 남습니다.', privacyLink: '전체 개인정보 처리방침 보기', arch: { darwin: { arm64: 'Apple 실리콘', x64: 'Intel' }, win32: { x64: '표준 (x64)', arm64: 'ARM64' }, linux: { x64: 'x64', arm64: 'ARM64' } } },
    footer: { tagline: '움직이는 이미지를 깊이 있게 다루는 사람을 위한 로컬 AI 비디오 워크스페이스.', docs: '문서', privacy: '개인정보', issues: '문제 신고', note: '영상과 함께 일하는 사람을 위해 만들었습니다.' }
  }
}

function getValue(locale, key) {
  return key.split('.').reduce((value, part) => value?.[part], copy[locale]) ?? key
}

function detectLocale() {
  const saved = localStorage.getItem(STORAGE_KEY)
  if (saved && saved !== 'auto' && copy[saved]) return saved
  const languages = navigator.languages?.length ? navigator.languages : [navigator.language]
  for (const language of languages) {
    const match = Object.keys(copy).find((locale) => locale.toLowerCase() === language.toLowerCase() || locale.split('-')[0] === language.split('-')[0])
    if (match) return match
  }
  return 'en-US'
}

function setText(element, value) {
  element.innerHTML = value
}

function renderLocale(locale) {
  document.documentElement.lang = locale
  document.querySelectorAll('[data-i18n]').forEach((element) => setText(element, getValue(locale, element.dataset.i18n)))
  document.querySelectorAll('[data-i18n-attr]').forEach((element) => {
    const [attribute, key] = element.dataset.i18nAttr.split(':')
    element.setAttribute(attribute, getValue(locale, key))
  })
  document.title = locale === 'zh-CN' ? 'AIVPlayer — 本地 AI 视频工作台' : locale === 'ja-JP' ? 'AIVPlayer — ローカル AI ビデオワークスペース' : locale === 'ko-KR' ? 'AIVPlayer — 로컬 AI 비디오 워크스페이스' : 'AIVPlayer — Local AI video workspace'
  const settingsScreenshot = document.getElementById('settings-screenshot')
  if (settingsScreenshot) {
    settingsScreenshot.src = locale === 'zh-CN'
      ? 'https://releases.quniv.cn/aivplayer/site/screenshots/settings-panel.png'
      : 'https://releases.quniv.cn/aivplayer/site/screenshots/settings-panel-en.png'
  }
  const select = document.getElementById('language-select')
  if (select) select.value = localStorage.getItem(STORAGE_KEY) || 'auto'
  renderDownloadControls(locale)
}

function detectDownloadPlatform() {
  const platformHint = [navigator.userAgentData?.platform, navigator.platform, navigator.userAgent].filter(Boolean).join(' ').toLowerCase()
  return platformHint.includes('win') ? 'win32' : platformHint.includes('mac') || platformHint.includes('darwin') ? 'darwin' : platformHint.includes('linux') ? 'linux' : null
}

function normalizeDownloadArchitecture(architecture, bitness) {
  const architectureHint = String(architecture ?? '').toLowerCase()
  const bitnessHint = String(bitness ?? '')
  if (/arm64|aarch64|armv8|^arm$/.test(architectureHint)) return 'arm64'
  if (/x86_64|amd64|x64/.test(architectureHint) || architectureHint === 'x86' && bitnessHint === '64') return 'x64'
  return null
}

async function detectDownloadTarget() {
  const platform = detectDownloadPlatform()
  const userAgentData = navigator.userAgentData
  if (typeof userAgentData?.getHighEntropyValues !== 'function') {
    return { platform, architecture: null, architectureSource: 'unavailable' }
  }
  try {
    const values = await userAgentData.getHighEntropyValues(['architecture', 'bitness'])
    const architecture = normalizeDownloadArchitecture(values.architecture, values.bitness)
    return { platform, architecture, architectureSource: architecture ? 'ua-ch' : 'unavailable' }
  } catch (error) {
    console.warn('Unable to read the browser architecture hint.', error)
    return { platform, architecture: null, architectureSource: 'unavailable' }
  }
}
let activeDownloadManifest = FALLBACK_DOWNLOAD_MANIFEST
let detectedDownloadTarget = { platform: null, architecture: null }

function getCurrentDownloadRelease() {
  return activeDownloadManifest.releases?.[0] ?? FALLBACK_DOWNLOAD_MANIFEST.releases[0]
}

function getAvailableDownloadTargets(release = getCurrentDownloadRelease()) {
  return Object.keys(release.assets ?? {})
}

function getPlatformLabel(locale, platform) {
  return getValue(locale, `download.${platformCopyKeys[platform] ?? platform}`)
}

function getArchitectureLabel(locale, architecture) {
  return getValue(locale, `download.${architecture}`)
}

function getPlatformOptions(release = getCurrentDownloadRelease()) {
  return [...new Set(getAvailableDownloadTargets(release).map((target) => target.split('-')[0]))]
}

function getArchitectureOptions(platform, release = getCurrentDownloadRelease()) {
  return getAvailableDownloadTargets(release)
    .filter((target) => target.startsWith(`${platform}-`))
    .map((target) => target.slice(platform.length + 1))
}

function getFormatOptions(platform, architecture, release = getCurrentDownloadRelease()) {
  const target = `${platform}-${architecture}`
  const asset = release.assets?.[target]
  if (!asset) return []
  if (asset.name) return [asset.format]
  return Object.keys(asset)
}

function pickDownloadTarget(preferred = detectedDownloadTarget, release = getCurrentDownloadRelease()) {
  const platforms = getPlatformOptions(release)
  const platform = platforms.includes(preferred.platform) ? preferred.platform : platforms[0]
  if (!platform) return { platform: null, architecture: null, format: null, asset: null }
  const architectures = getArchitectureOptions(platform, release)
  const architecture = preferred.architecture && architectures.includes(preferred.architecture) ? preferred.architecture : null
  const formats = architecture ? getFormatOptions(platform, architecture, release) : []
  const format = formats.length > 0 ? formats[0] : null
  const assetKey = `${platform}-${architecture}`
  const assetEntry = release.assets?.[assetKey]
  let asset = null
  if (assetEntry) {
    if (assetEntry.name) {
      asset = assetEntry
    } else if (format && assetEntry[format]) {
      asset = assetEntry[format]
    }
  }
  return { platform, architecture, format, asset }
}

function detectDownloadPlatform() {
  const platformHint = [navigator.userAgentData?.platform, navigator.platform, navigator.userAgent].filter(Boolean).join(' ').toLowerCase()
  return platformHint.includes('win') ? 'win32' : platformHint.includes('mac') || platformHint.includes('darwin') ? 'darwin' : platformHint.includes('linux') ? 'linux' : null
}

function normalizeDownloadArchitecture(architecture, bitness) {
  const architectureHint = String(architecture ?? '').toLowerCase()
  const bitnessHint = String(bitness ?? '')
  if (/arm64|aarch64|armv8|^arm$/.test(architectureHint)) return 'arm64'
  if (/x86_64|amd64|x64/.test(architectureHint) || architectureHint === 'x86' && bitnessHint === '64') return 'x64'
  return null
}

async function detectDownloadTarget() {
  const platform = detectDownloadPlatform()
  const userAgentData = navigator.userAgentData
  if (typeof userAgentData?.getHighEntropyValues !== 'function') {
    return { platform, architecture: null, architectureSource: 'unavailable' }
  }
  try {
    const values = await userAgentData.getHighEntropyValues(['architecture', 'bitness'])
    const architecture = normalizeDownloadArchitecture(values.architecture, values.bitness)
    return { platform, architecture, architectureSource: architecture ? 'ua-ch' : 'unavailable' }
  } catch (error) {
    console.warn('Unable to read the browser architecture hint.', error)
    return { platform, architecture: null, architectureSource: 'unavailable' }
  }
}

// ==============================
// Download controls (cards + chips)
// ==============================
let chooserState = {
  platform: null,    // null = use detected/recommended
  architecture: null,
  version: null,     // null = use latest release
  format: null       // null = use default format
}
let chooserExpanded = false

function getArchitectureFriendlyLabel(locale, platform, architecture) {
  const specific = getValue(locale, `download.arch.${platform}.${architecture}`)
  if (specific !== `download.arch.${platform}.${architecture}`) return specific
  return getValue(locale, `download.${architecture}`)
}

function getPlatformCardMeta(locale, platform, release) {
  const architectures = getArchitectureOptions(platform, release)
  return architectures.map((arch) => getArchitectureFriendlyLabel(locale, platform, arch)).join(' · ')
}

function getCurrentSelection(locale) {
  const release = getCurrentDownloadRelease()
  const recommended = pickDownloadTarget(detectedDownloadTarget, release)
  const platforms = getPlatformOptions(release)
  const platform = chooserState.platform && platforms.includes(chooserState.platform)
    ? chooserState.platform
    : recommended.platform
  const archs = platform ? getArchitectureOptions(platform, release) : []
  const recommendedArch = platform === recommended.platform ? recommended.architecture : null
  const architecture = chooserState.architecture && archs.includes(chooserState.architecture)
    ? chooserState.architecture
    : (recommendedArch ?? archs[0] ?? null)
  const formats = platform && architecture ? getFormatOptions(platform, architecture, release) : []
  const recommendedFormat = platform === recommended.platform && architecture === recommended.architecture ? recommended.format : null
  const format = chooserState.format && formats.includes(chooserState.format)
    ? chooserState.format
    : (recommendedFormat ?? formats[0] ?? null)
  const versionPool = activeDownloadManifest.releases ?? FALLBACK_DOWNLOAD_MANIFEST.releases
  const version = chooserState.version && versionPool.some((entry) => entry.version === chooserState.version)
    ? chooserState.version
    : release.version
  const versionRelease = versionPool.find((entry) => entry.version === version) ?? release
  const assetKey = `${platform}-${architecture}`
  const assetEntry = versionRelease.assets?.[assetKey]
  let asset = null
  if (assetEntry) {
    if (assetEntry.name) {
      asset = assetEntry
    } else if (format && assetEntry[format]) {
      asset = assetEntry[format]
    }
  }
  return { platform, architecture, format, version, release: versionRelease, recommended, asset }
}

function createPlatformCard(platform, locale, release, isActive) {
  const card = document.createElement('button')
  card.type = 'button'
  card.className = 'download-platform-card' + (isActive ? ' is-active' : '')
  card.dataset.platform = platform
  card.setAttribute('role', 'radio')
  card.setAttribute('aria-checked', String(isActive))
  card.setAttribute('aria-label', getPlatformLabel(locale, platform))
  const icon = createPlatformIcon(platform, 'download-platform-card-icon')
  const text = document.createElement('span')
  text.className = 'download-platform-card-text'
  const name = document.createElement('span')
  name.className = 'download-platform-card-name'
  name.textContent = getPlatformLabel(locale, platform)
  const meta = document.createElement('span')
  meta.className = 'download-platform-card-meta'
  meta.textContent = getPlatformCardMeta(locale, platform, release)
  text.append(name, meta)
  card.append(icon, text)
  return card
}

function renderPlatformGrid(locale) {
  const grid = document.getElementById('download-platform-grid')
  if (!grid) return
  const release = getCurrentDownloadRelease()
  const platforms = getPlatformOptions(release)
  const selection = getCurrentSelection(locale)
  grid.replaceChildren(...platforms.map((platform) => createPlatformCard(platform, locale, release, platform === selection.platform)))
}

function createFormatChip(format, locale, platform, architecture, release, isActive) {
  const chip = document.createElement('button')
  chip.type = 'button'
  chip.className = 'download-chip' + (isActive ? ' is-active' : '')
  chip.dataset.format = format
  chip.setAttribute('role', 'radio')
  chip.setAttribute('aria-checked', String(isActive))
  chip.setAttribute('aria-label', format.toUpperCase())
  const label = document.createElement('span')
  label.className = 'download-chip-label'
  label.textContent = format.toUpperCase()
  chip.append(label)
  return chip
}

function renderFormatChips(locale) {
  const container = document.getElementById('download-format-chips')
  if (!container) return
  const selection = getCurrentSelection(locale)
  if (!selection.platform || !selection.architecture) { container.replaceChildren(); return }
  const formats = getFormatOptions(selection.platform, selection.architecture, selection.release)
  if (formats.length <= 1) { container.replaceChildren(); return }
  container.replaceChildren(...formats.map((format) => createFormatChip(
    format,
    locale,
    selection.platform,
    selection.architecture,
    selection.release,
    format === selection.format
  )))
}

function createArchitectureChip(architecture, locale, platform, release, isActive, isDisabled, isMissingAsset) {
  const chip = document.createElement('button')
  chip.type = 'button'
  chip.className = 'download-chip'
    + (isActive ? ' is-active' : '')
    + (isDisabled ? ' is-disabled' : '')
  chip.dataset.architecture = architecture
  chip.setAttribute('role', 'radio')
  chip.setAttribute('aria-checked', String(isActive))
  if (isDisabled) chip.setAttribute('aria-disabled', 'true')
  chip.setAttribute('aria-label', getArchitectureFriendlyLabel(locale, platform, architecture))
  const label = document.createElement('span')
  label.className = 'download-chip-label'
  label.textContent = getArchitectureFriendlyLabel(locale, platform, architecture)
  chip.append(label)
  if (isMissingAsset) {
    const tag = document.createElement('span')
    tag.className = 'download-chip-tag'
    tag.textContent = getValue(locale, 'download.unavailableTag')
    chip.append(tag)
  }
  return chip
}

function renderArchitectureChips(locale) {
  const container = document.getElementById('download-architecture-chips')
  if (!container) return
  const selection = getCurrentSelection(locale)
  if (!selection.platform) { container.replaceChildren(); return }
  const archs = getArchitectureOptions(selection.platform, selection.release)
  // Disable all arch chips when user picked a non-latest version (older releases may have different asset set)
  const disableForVersion = selection.version !== selection.recommended.version
  container.replaceChildren(...archs.map((arch) => createArchitectureChip(
    arch,
    locale,
    selection.platform,
    selection.release,
    arch === selection.architecture,
    disableForVersion && !selection.release.assets?.[`${selection.platform}-${arch}`],
    !selection.release.assets?.[`${selection.platform}-${arch}`]
  )))
}

function createVersionChip(version, locale, isActive) {
  const chip = document.createElement('button')
  chip.type = 'button'
  chip.className = 'download-chip' + (isActive ? ' is-active' : '')
  chip.dataset.version = version
  chip.setAttribute('role', 'radio')
  chip.setAttribute('aria-checked', String(isActive))
  const label = document.createElement('span')
  label.className = 'download-chip-label'
  label.textContent = version === getCurrentDownloadRelease().version
    ? getValue(locale, 'download.versionLatest').replace('{version}', `v${version}`)
    : `v${version}`
  chip.append(label)
  return chip
}

function renderVersionChips(locale) {
  const container = document.getElementById('download-version-chips')
  if (!container) return
  const releases = activeDownloadManifest.releases ?? FALLBACK_DOWNLOAD_MANIFEST.releases
  const selection = getCurrentSelection(locale)
  container.replaceChildren(...releases.map((entry) => createVersionChip(entry.version, locale, entry.version === selection.version)))
}

function renderDownloadControls(locale) {
  if (!document.getElementById('download-console')) return
  const release = getCurrentDownloadRelease()
  const recommended = pickDownloadTarget(detectedDownloadTarget, release)
  const selection = getCurrentSelection(locale)
  const hasAsset = Boolean(selection.asset)
  const downloadUrl = selection.asset?.url ?? release.githubUrl ?? GITHUB_RELEASES_URL

  // 1) Recommended panel — always reflects the auto-detected recommendation
  const recTitle = document.getElementById('download-recommended-title')
  const recMeta = document.getElementById('download-recommended-meta')
  const recIcon = document.getElementById('download-recommended-icon')
  const recLink = document.getElementById('download-recommended-link')
  const recLabel = recLink?.querySelector('[data-i18n]')

  if (recIcon) {
    recIcon.replaceChildren(recommended.platform
      ? createPlatformIcon(recommended.platform, 'download-recommended-icon')
      : createDownloadIcon(architectureIconSvg, 'download-recommended-icon'))
  }
  if (recTitle) {
    recTitle.textContent = recommended.platform ? getPlatformLabel(locale, recommended.platform) : 'AIVPlayer'
  }

  if (recMeta) {
    const archLabel = recommended.architecture ? getArchitectureFriendlyLabel(locale, recommended.platform, recommended.architecture) : ''
    const detectedWord = getValue(locale, 'download.detected')
    if (recommended.asset) {
      recMeta.textContent = archLabel
        ? `${detectedWord} · ${archLabel} · v${release.version}`
        : `v${release.version}`
    } else if (!recommended.platform) {
      recMeta.textContent = getValue(locale, 'download.choosePlatform')
    } else if (detectedDownloadTarget.platform && !recommended.architecture) {
      recMeta.textContent = getValue(locale, 'download.architectureUnknown')
    } else {
      recMeta.textContent = getValue(locale, 'download.unavailable')
    }
  }

  if (recLink) {
    recLink.href = recommended.asset?.url ?? '#download-chooser'
    recLink.target = recommended.asset ? '_blank' : '_self'
    recLink.setAttribute('aria-label', getValue(locale, recommended.asset ? 'download.downloadRecommended' : 'download.choosePlatform'))
    if (recLabel) {
      recLabel.textContent = recommended.platform
        ? getValue(locale, 'download.downloadFor').replace('{platform}', getPlatformLabel(locale, recommended.platform))
        : getValue(locale, 'download.downloadRecommended')
    }
  }

  // 2) Platform grid (always rendered)
  renderPlatformGrid(locale)

  // 3) Detail panel — expand only when user deviated from recommendation, or detection is incomplete
  const detail = document.getElementById('download-detail')
  const shouldExpand = chooserExpanded
    || (selection.platform !== recommended.platform)
    || (selection.architecture && selection.architecture !== recommended.architecture)
    || (selection.version !== release.version)
    || !detectedDownloadTarget.platform
  if (detail) detail.hidden = !shouldExpand

  if (shouldExpand) {
    renderArchitectureChips(locale)
    renderFormatChips(locale)
    renderVersionChips(locale)
  }

  // 4) Detail actions — download button + archive link
  const manualLink = document.getElementById('download-manual-link')
  if (manualLink) {
    manualLink.href = downloadUrl
    manualLink.target = hasAsset ? '_blank' : '_self'
    const manualLabel = manualLink.querySelector('[data-i18n]')
    if (manualLabel) {
      const platformLabel = selection.platform ? getPlatformLabel(locale, selection.platform) : ''
      const archLabel = selection.architecture ? getArchitectureFriendlyLabel(locale, selection.platform, selection.architecture) : ''
      const buildLabel = [platformLabel, archLabel].filter(Boolean).join(' · ')
      manualLabel.textContent = hasAsset && buildLabel
        ? getValue(locale, 'download.downloadFor').replace('{platform}', buildLabel)
        : getValue(locale, 'download.downloadSelected')
    }
    manualLink.setAttribute('aria-label', getValue(locale, hasAsset ? 'download.downloadSelected' : 'download.archiveLink'))
  }

  const allReleasesLink = document.getElementById('download-all-releases-link')
  if (allReleasesLink) allReleasesLink.href = GITHUB_RELEASES_URL
}

function wirePlatformCards() {
  const grid = document.getElementById('download-platform-grid')
  if (!grid) return
  grid.addEventListener('click', (event) => {
    const card = event.target instanceof Element ? event.target.closest('.download-platform-card') : null
    if (!card) return
    const platform = card.dataset.platform
    if (!platform) return
    chooserState.platform = platform
    chooserState.architecture = null
    chooserState.version = null
    chooserExpanded = true
    renderDownloadControls(detectLocale())
  })
  grid.addEventListener('keydown', (event) => {
    if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(event.key)) return
    event.preventDefault()
    const cards = [...grid.querySelectorAll('.download-platform-card')]
    if (!cards.length) return
    const currentIndex = cards.indexOf(document.activeElement)
    const direction = event.key === 'ArrowLeft' || event.key === 'ArrowUp' ? -1 : 1
    const nextIndex = (currentIndex < 0 ? 0 : (currentIndex + direction + cards.length) % cards.length)
    cards[nextIndex].focus()
  })
}

function wireChipGroup(containerId, stateKey) {
  const container = document.getElementById(containerId)
  if (!container) return
  container.addEventListener('click', (event) => {
    const chip = event.target instanceof Element ? event.target.closest('.download-chip') : null
    if (!chip || chip.classList.contains('is-disabled')) return
    const value = chip.dataset[stateKey]
    if (!value) return
    chooserState[stateKey] = value
    if (stateKey === 'architecture') {
      chooserState.format = null
    }
    chooserExpanded = true
    renderDownloadControls(detectLocale())
  })
  container.addEventListener('keydown', (event) => {
    if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(event.key)) return
    event.preventDefault()
    const chips = [...container.querySelectorAll('.download-chip:not(.is-disabled)')]
    if (!chips.length) return
    const currentIndex = chips.indexOf(document.activeElement)
    const direction = event.key === 'ArrowLeft' || event.key === 'ArrowUp' ? -1 : 1
    const nextIndex = (currentIndex < 0 ? 0 : (currentIndex + direction + chips.length) % chips.length)
    chips[nextIndex].focus()
  })
}

function wireFormatChips() {
  wireChipGroup('download-format-chips', 'format')
}

function wireArchitectureChips() {
  wireChipGroup('download-architecture-chips', 'architecture')
}

function wireVersionChips() {
  wireChipGroup('download-version-chips', 'version')
}

function isDownloadManifest(value) {
  return value?.schemaVersion === 1 && Array.isArray(value.releases) && value.releases.length > 0 && value.releases.every((release) => release?.version && release?.assets && typeof release.assets === 'object')
}

async function loadDownloadManifest() {
  try {
    const response = await fetch(DOWNLOAD_MANIFEST_URL, { cache: 'no-store' })
    if (!response.ok) throw new Error(`Download manifest request failed: ${response.status}`)
    const candidate = await response.json()
    if (!isDownloadManifest(candidate)) throw new Error('Download manifest shape is invalid')
    activeDownloadManifest = candidate
    renderDownloadControls(detectLocale())
  } catch (error) {
    console.warn('Using the built-in download fallback.', error)
  }
}

// If the recommended build is unavailable, expand the chooser instead of going to GitHub
document.addEventListener('click', (event) => {
  const link = event.target instanceof Element ? event.target.closest('#download-recommended-link') : null
  if (link && link.getAttribute('href') === '#download-chooser') {
    event.preventDefault()
    chooserExpanded = true
    renderDownloadControls(detectLocale())
  }
})
function closeMobileMenu() {
  const menu = document.getElementById('mobile-menu')
  const button = document.getElementById('mobile-menu-button')
  if (!menu || !button) return
  menu.hidden = true
  button.setAttribute('aria-expanded', 'false')
}

document.addEventListener('DOMContentLoaded', () => {
  renderLocale(detectLocale())
  void detectDownloadTarget().then((target) => {
    detectedDownloadTarget = target
    renderDownloadControls(detectLocale())
  })
  void loadDownloadManifest()

  const languageSelect = document.getElementById('language-select')
  languageSelect?.addEventListener('change', (event) => {
    const value = event.target.value
    localStorage.setItem(STORAGE_KEY, value)
    renderLocale(value === 'auto' ? detectLocale() : value)
  })

  wirePlatformCards()
  wireArchitectureChips()
  wireFormatChips()
  wireVersionChips()

  const menu = document.getElementById('mobile-menu')
  const menuButton = document.getElementById('mobile-menu-button')
  menuButton?.addEventListener('click', () => {
    const open = menu.hidden
    menu.hidden = !open
    menuButton.setAttribute('aria-expanded', String(open))
  })
  menu?.querySelectorAll('a').forEach((link) => link.addEventListener('click', closeMobileMenu))

  const backToTop = document.getElementById('back-to-top')
  window.addEventListener('scroll', () => backToTop?.classList.toggle('is-visible', window.scrollY > 520), { passive: true })
  backToTop?.addEventListener('click', () => window.scrollTo({ top: 0, behavior: 'smooth' }))

  const observer = new IntersectionObserver((entries) => entries.forEach((entry) => {
    if (entry.isIntersecting) entry.target.classList.add('is-visible')
  }), { threshold: 0.12 })
  document.querySelectorAll('.feature-item, .workflow-steps article, .preview-card, .platform-card').forEach((element) => observer.observe(element))
})
