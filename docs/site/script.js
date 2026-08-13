const STORAGE_KEY = 'aivplayer-site-language'

const copy = {
  'zh-CN': {
    a11y: { skip: '跳到主要内容' },
    language: { label: '语言', auto: '跟随系统' },
    nav: { features: '功能', workflow: '工作流', preview: '界面预览', download: '下载', docs: '文档' },
    hero: { eyebrow: '本地优先 · 为视频而生', title: '你的本地 AI<br><em>视频工作台。</em>', lede: 'AIVPlayer 把播放、字幕、视觉检索和剪辑收进一款专注的桌面应用。媒体和项目默认留在你的设备上。', primary: '下载 AIVPlayer', secondary: '查看功能', localNote: '本地运行，无需账号。', mediaCaption: '真实界面 · 截取自 AIVPlayer 0.5.5' },
    signals: { local: '本地优先处理', languages: '简体中文 · English · 日本語 · 한국어', platforms: 'macOS · Windows · Linux' },
    features: { eyebrow: '一款应用，完成整条工作流', title: '少切换工具。<br><em>把时间留给内容。</em>', lede: 'AIVPlayer 让高频视频工作保持连贯：观看、理解、选段和创作，都不必把媒体库交给云端。', subtitle: { title: '字幕始终在身边', body: '用 whisper.cpp 在本地生成字幕；需要时通过 OpenAI 兼容服务翻译，并导出干净的外挂字幕文件。' }, search: { title: '找到你记得的画面', body: '使用 SigLIP2 和 LanceDB 建立本地视觉影视库。按文字或图片搜索，直接跳到匹配的时间点。' }, edit: { title: '把选段变成工作', body: '在同一个本地工作区里使用 Clip Inbox、多轨剪辑、字幕、图片工具和 AI 短剧文本创作。' } },
    workflow: { eyebrow: '更清晰的剪辑路径', title: '从导入<br>到洞察。', lede: '每一步都有自己的位置，文件和决定仍然由你掌控。', link: '阅读工作流文档', import: { title: '导入', body: '打开视频、图片、Live Photo 或音频，媒体库留在本机。' }, understand: { title: '理解', body: '按需生成字幕、摘要、章节和视觉证据。' }, shape: { title: '创作', body: '收集片段、调整字幕、处理图片，并在时间线上剪辑。' }, export: { title: '导出', body: '导出片段、字幕和工程，也可以在局域网共享 Web 播放器。' } },
    preview: { eyebrow: '不是占位图', title: '先看看工作区<br><em>真实的样子。</em>', lede: '以下都是桌面端真实截图，不是占位符。界面深色、适合键盘操作，并围绕当前媒体展开。', playerAlt: 'AIVPlayer 显示视频和字幕生成面板', settingsAlt: 'AIVPlayer 偏好设置窗口，显示界面语言设置', playerTitle: '播放 + 字幕工作区', playerCaption: '观看、跳转、检查运行状态，并在一个界面准备本地 ASR。', settingsTitle: '尊重你的使用方式', settingsCaption: '语言、文件夹、播放、截图录屏、快捷键和 AI 服务都可以配置。' },
    quickstart: { eyebrow: '无需复杂仪式', title: '打开视频。<br><em>继续工作。</em>', lede: '安装包自带核心播放和媒体运行时。可选 AI 模型只会在你主动使用时下载。', engine: { title: '安装应用', body: '下载对应系统的安装包，打开你的第一个文件。' }, model: { title: '需要时再添加模型', body: '在应用内选择模型来源，不会静默下载大文件。' }, ai: { title: '按你的方式连接 AI', body: '翻译和生成使用你配置的地址和密钥，不需要 AIVPlayer 账号。' } },
    download: { eyebrow: '准备好时再开始', title: '选择你的平台。', lede: 'AIVPlayer 开源并通过 GitHub 发布。你可以下载安装包，也可以先查看源代码。', macos: 'Apple silicon 和 Intel 版本', windows: 'x64 和 ARM64 安装包', linux: 'AppImage 和 Debian 安装包', privacyTitle: '本地优先的设计', privacyBody: '你的文件、工程、字幕和索引默认保存在本地。', privacyLink: '查看完整隐私政策' },
    footer: { tagline: '为认真处理动态影像的人准备的本地 AI 视频工作台。', docs: '使用文档', privacy: '隐私政策', issues: '反馈问题', note: '为与影像一起工作的人而造。' }
  },
  'en-US': {
    a11y: { skip: 'Skip to content' },
    language: { label: 'Language', auto: 'Auto' },
    nav: { features: 'Features', workflow: 'Workflow', preview: 'Preview', download: 'Download', docs: 'Docs' },
    hero: { eyebrow: 'PRIVATE BY DEFAULT · BUILT FOR VIDEO', title: 'Your local AI<br><em>video workspace.</em>', lede: 'AIVPlayer brings playback, subtitles, visual search, and editing into one focused desktop app. Your media and projects stay on your machine by default.', primary: 'Download AIVPlayer', secondary: 'Explore features', localNote: 'Runs locally. No account required.', mediaCaption: 'Real interface · captured from AIVPlayer 0.5.5' },
    signals: { local: 'Local-first processing', languages: '中文 · English · 日本語 · 한국어', platforms: 'macOS · Windows · Linux' },
    features: { eyebrow: 'ONE APP, THE WHOLE CUT', title: 'Less tool switching.<br><em>More time with the story.</em>', lede: 'AIVPlayer keeps the everyday video workflow close: watch, understand, select, and shape without handing your library to a cloud service.', subtitle: { title: 'Subtitles that stay close', body: 'Generate local subtitles with whisper.cpp, translate through an OpenAI-compatible service when you choose, and export the result as a clean sidecar file.' }, search: { title: 'Find the frame you remember', body: 'Build a local visual library with SigLIP2 and LanceDB. Search by words or an image, then jump straight to the matching moment.' }, edit: { title: 'Turn selections into work', body: 'Use Clip Inbox, multi-track editing, captions, image tools, and AI short-drama writing in the same local workspace.' } },
    workflow: { eyebrow: 'A CLEARER CUT', title: 'From import<br>to insight.', lede: 'The app gives every stage a place, while keeping the files and decisions under your control.', link: 'Read the workflow docs', import: { title: 'Import', body: 'Open video, images, Live Photos, or audio and keep the library on disk.' }, understand: { title: 'Understand', body: 'Generate subtitles, summaries, chapters, and visual evidence when you need them.' }, shape: { title: 'Shape', body: 'Collect clips, refine captions, adjust images, and edit on a timeline.' }, export: { title: 'Export', body: 'Export clips, subtitles, projects, and share a local web player on your network.' } },
    preview: { eyebrow: 'NO MOCKUPS', title: 'See the workspace<br><em>as it really is.</em>', lede: 'These are direct captures from the desktop app, not placeholders. The interface is dark, keyboard-friendly, and designed around the media in front of you.', playerAlt: 'AIVPlayer showing a video and subtitle generation panel', settingsAlt: 'AIVPlayer preferences window showing interface language settings', playerTitle: 'Playback + subtitle workspace', playerCaption: 'Watch, seek, inspect engine readiness, and prepare local ASR in one view.', settingsTitle: 'Preferences that respect your setup', settingsCaption: 'Language, folders, playback, capture, shortcuts, and AI services stay configurable.' },
    quickstart: { eyebrow: 'START WITHOUT THE RITUAL', title: 'Open a video.<br><em>Keep going.</em>', lede: 'The packaged app includes the core playback and media runtime. Optional AI models are downloaded only when you ask for them.', engine: { title: 'Install the app', body: 'Download the package for your operating system and open your first file.' }, model: { title: 'Add a model when needed', body: 'Choose a model source inside the app. Nothing large is downloaded silently.' }, ai: { title: 'Connect AI on your terms', body: 'Translation and generation use the endpoint and key you configure, not an AIVPlayer account.' } },
    download: { eyebrow: 'READY WHEN YOU ARE', title: 'Choose your platform.', lede: 'AIVPlayer is open source and released through GitHub. Choose an installer or inspect the source before you begin.', macos: 'Apple silicon and Intel builds', windows: 'x64 and ARM64 installers', linux: 'AppImage and Debian packages', privacyTitle: 'Local-first by design', privacyBody: 'Your files, projects, subtitles, and indexes remain local by default.', privacyLink: 'Read the full privacy policy' },
    footer: { tagline: 'A local AI video workspace for thoughtful editing.', docs: 'Documentation', privacy: 'Privacy', issues: 'Report an issue', note: 'Built for people who work with moving images.' }
  },
  'ja-JP': {
    a11y: { skip: '本文へ移動' },
    language: { label: '言語', auto: 'システムに合わせる' },
    nav: { features: '機能', workflow: 'ワークフロー', preview: '画面プレビュー', download: 'ダウンロード', docs: 'ドキュメント' },
    hero: { eyebrow: 'ローカル優先 · 映像のために', title: 'あなたのローカル AI<br><em>ビデオワークスペース。</em>', lede: 'AIVPlayer は再生、字幕、ビジュアル検索、編集をひとつのデスクトップアプリにまとめます。メディアとプロジェクトは標準で端末内に保存されます。', primary: 'AIVPlayer をダウンロード', secondary: '機能を見る', localNote: 'ローカルで動作。アカウント不要。', mediaCaption: '実際の画面 · AIVPlayer 0.5.5 で撮影' },
    signals: { local: 'ローカル優先の処理', languages: '简体中文 · English · 日本語 · 한국어', platforms: 'macOS · Windows · Linux' },
    features: { eyebrow: 'ひとつのアプリで、一本を仕上げる', title: 'ツールの切り替えを減らし、<br><em>物語に向き合う時間を。</em>', lede: '見る、理解する、選ぶ、形にする。ライブラリをクラウドサービスに預けず、日々の映像作業をひとつにつなぎます。', subtitle: { title: 'そばにある字幕', body: 'whisper.cpp で字幕をローカル生成。必要なときだけ OpenAI 互換サービスで翻訳し、サイドカーファイルとして書き出せます。' }, search: { title: '覚えているフレームを探す', body: 'SigLIP2 と LanceDB でローカルのビジュアルライブラリを構築。言葉や画像で検索して、その瞬間へ移動できます。' }, edit: { title: '選んだ素材を仕事にする', body: 'Clip Inbox、マルチトラック編集、字幕、画像ツール、AI 短編ドラマの文章制作を同じワークスペースで。' } },
    workflow: { eyebrow: 'わかりやすい編集の流れ', title: '読み込みから<br>インサイトへ。', lede: '各ステージに居場所を作りながら、ファイルと判断はあなたの手元に残します。', link: 'ワークフローのドキュメント', import: { title: '読み込む', body: '動画、画像、Live Photo、音声を開き、ライブラリを端末に保ちます。' }, understand: { title: '理解する', body: '必要なときに字幕、要約、チャプター、視覚エビデンスを生成します。' }, shape: { title: '形にする', body: 'クリップを集め、字幕を整え、画像を調整し、タイムラインで編集します。' }, export: { title: '書き出す', body: 'クリップ、字幕、プロジェクトを出力し、ローカル Web プレーヤーも共有できます。' } },
    preview: { eyebrow: 'モックアップではありません', title: 'ワークスペースを<br><em>実際の画面で。</em>', lede: 'デスクトップアプリを直接撮影した画面です。暗いテーマ、キーボード操作、目の前のメディアを中心に設計されています。', playerAlt: '動画と字幕生成パネルを表示した AIVPlayer', settingsAlt: 'インターフェース言語設定を表示した AIVPlayer の環境設定', playerTitle: '再生 + 字幕ワークスペース', playerCaption: '再生、シーク、エンジン状態の確認、ローカル ASR の準備をひとつの画面で。', settingsTitle: '使い方に合わせる環境設定', settingsCaption: '言語、フォルダ、再生、キャプチャ、ショートカット、AI サービスを設定できます。' },
    quickstart: { eyebrow: '面倒な手順なしで始める', title: '動画を開く。<br><em>そのまま続ける。</em>', lede: 'パッケージには再生とメディアの基本ランタイムが含まれます。AI モデルは必要なときだけダウンロードします。', engine: { title: 'アプリをインストール', body: 'OS に合うパッケージをダウンロードして、最初のファイルを開きます。' }, model: { title: '必要なときにモデルを追加', body: 'アプリ内でモデルソースを選択。大きなファイルを勝手にダウンロードしません。' }, ai: { title: '自分の方法で AI に接続', body: '翻訳と生成には設定したエンドポイントとキーを使い、AIVPlayer アカウントは必要ありません。' } },
    download: { eyebrow: '準備ができたら', title: 'プラットフォームを選ぶ。', lede: 'AIVPlayer はオープンソースで GitHub からリリースしています。インストーラーを選ぶか、ソースコードを確認できます。', macos: 'Apple silicon / Intel ビルド', windows: 'x64 / ARM64 インストーラー', linux: 'AppImage / Debian パッケージ', privacyTitle: 'ローカル優先の設計', privacyBody: 'ファイル、プロジェクト、字幕、インデックスは標準でローカルに残ります。', privacyLink: 'プライバシーポリシーを読む' },
    footer: { tagline: '動く映像と丁寧に向き合うためのローカル AI ビデオワークスペース。', docs: 'ドキュメント', privacy: 'プライバシー', issues: '問題を報告', note: '映像とともに働く人のために。' }
  },
  'ko-KR': {
    a11y: { skip: '본문으로 이동' },
    language: { label: '언어', auto: '시스템에 맞추기' },
    nav: { features: '기능', workflow: '워크플로', preview: '화면 미리보기', download: '다운로드', docs: '문서' },
    hero: { eyebrow: '로컬 우선 · 영상을 위해 설계', title: '당신의 로컬 AI<br><em>비디오 워크스페이스.</em>', lede: 'AIVPlayer는 재생, 자막, 시각 검색, 편집을 하나의 집중된 데스크톱 앱으로 묶습니다. 미디어와 프로젝트는 기본적으로 기기에 보관됩니다.', primary: 'AIVPlayer 다운로드', secondary: '기능 살펴보기', localNote: '로컬에서 실행됩니다. 계정이 필요 없습니다.', mediaCaption: '실제 인터페이스 · AIVPlayer 0.5.5에서 캡처' },
    signals: { local: '로컬 우선 처리', languages: '简体中文 · English · 日本語 · 한국어', platforms: 'macOS · Windows · Linux' },
    features: { eyebrow: '하나의 앱으로 전체 컷을', title: '도구 전환은 줄이고,<br><em>이야기에 더 집중하세요.</em>', lede: '보고, 이해하고, 고르고, 다듬는 흐름을 클라우드 서비스에 라이브러리를 맡기지 않고 한곳에 유지합니다.', subtitle: { title: '곁에 두는 자막', body: 'whisper.cpp로 로컬 자막을 만들고, 원할 때만 OpenAI 호환 서비스로 번역한 뒤 깔끔한 사이드카 파일로 내보냅니다.' }, search: { title: '기억하는 프레임 찾기', body: 'SigLIP2와 LanceDB로 로컬 시각 라이브러리를 만듭니다. 단어나 이미지로 검색하고 일치하는 순간으로 바로 이동하세요.' }, edit: { title: '선택을 작업으로 바꾸기', body: 'Clip Inbox, 멀티트랙 편집, 캡션, 이미지 도구, AI 숏드라마 글쓰기를 같은 로컬 워크스페이스에서 사용하세요.' } },
    workflow: { eyebrow: '더 선명한 편집 흐름', title: '가져오기에서<br>인사이트까지.', lede: '각 단계에 자리를 마련하면서 파일과 결정은 당신의 통제 아래 둡니다.', link: '워크플로 문서 읽기', import: { title: '가져오기', body: '영상, 이미지, Live Photo, 오디오를 열고 라이브러리를 디스크에 보관합니다.' }, understand: { title: '이해하기', body: '필요할 때 자막, 요약, 챕터, 시각 증거를 생성합니다.' }, shape: { title: '다듬기', body: '클립을 모으고 캡션을 정리하고 이미지를 조정하며 타임라인에서 편집합니다.' }, export: { title: '내보내기', body: '클립, 자막, 프로젝트를 내보내고 로컬 웹 플레이어를 네트워크에서 공유합니다.' } },
    preview: { eyebrow: '목업이 아닙니다', title: '워크스페이스를<br><em>있는 그대로 보세요.</em>', lede: '데스크톱 앱에서 직접 캡처한 화면입니다. 어둡고 키보드 친화적이며 지금 보고 있는 미디어를 중심으로 설계되었습니다.', playerAlt: '영상과 자막 생성 패널을 보여주는 AIVPlayer', settingsAlt: '인터페이스 언어 설정을 보여주는 AIVPlayer 환경설정', playerTitle: '재생 + 자막 워크스페이스', playerCaption: '재생하고 탐색하고 엔진 상태를 확인하며 로컬 ASR을 한 화면에서 준비합니다.', settingsTitle: '사용 방식에 맞는 환경설정', settingsCaption: '언어, 폴더, 재생, 캡처, 단축키, AI 서비스를 설정할 수 있습니다.' },
    quickstart: { eyebrow: '복잡한 의식 없이 시작', title: '영상을 여세요.<br><em>계속 작업하세요.</em>', lede: '패키지 앱에는 핵심 재생 및 미디어 런타임이 포함됩니다. 선택적 AI 모델은 요청할 때만 다운로드됩니다.', engine: { title: '앱 설치', body: '운영체제에 맞는 패키지를 내려받고 첫 파일을 엽니다.' }, model: { title: '필요할 때 모델 추가', body: '앱 안에서 모델 소스를 선택하세요. 큰 파일을 몰래 다운로드하지 않습니다.' }, ai: { title: '원하는 방식으로 AI 연결', body: '번역과 생성은 설정한 엔드포인트와 키를 사용하며 AIVPlayer 계정은 필요하지 않습니다.' } },
    download: { eyebrow: '준비되었을 때', title: '플랫폼을 선택하세요.', lede: 'AIVPlayer는 오픈 소스이며 GitHub를 통해 배포됩니다. 설치 프로그램을 선택하거나 소스부터 확인할 수 있습니다.', macos: 'Apple silicon 및 Intel 빌드', windows: 'x64 및 ARM64 설치 프로그램', linux: 'AppImage 및 Debian 패키지', privacyTitle: '로컬 우선 설계', privacyBody: '파일, 프로젝트, 자막, 인덱스는 기본적으로 로컬에 남습니다.', privacyLink: '전체 개인정보 처리방침 보기' },
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
}

function closeMobileMenu() {
  const menu = document.getElementById('mobile-menu')
  const button = document.getElementById('mobile-menu-button')
  if (!menu || !button) return
  menu.hidden = true
  button.setAttribute('aria-expanded', 'false')
}

document.addEventListener('DOMContentLoaded', () => {
  renderLocale(detectLocale())

  const languageSelect = document.getElementById('language-select')
  languageSelect?.addEventListener('change', (event) => {
    const value = event.target.value
    localStorage.setItem(STORAGE_KEY, value)
    renderLocale(value === 'auto' ? detectLocale() : value)
  })

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
