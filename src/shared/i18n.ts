import type { AppSettingsSectionId, SubtitleDisplayMode, SubtitleLineHeight } from './app-settings'
import type { ClipExportLengthSeconds, ClipExportMode } from './clip-export'
import type { AsrModelSourceId } from './media-types'
import {
  DEFAULT_APP_LOCALE,
  DEFAULT_SUBTITLE_LANGUAGE,
  type AppLocale,
  type SubtitleLanguageId
} from './localization.ts'

export type LocaleCopy = {
  appName: string
  languageOptions: Record<AppLocale, { label: string; description: string }>
  subtitleLanguageOptions: Record<SubtitleLanguageId, { label: string; description: string }>
  topbar: {
    openFiles: string
    togglePlaylist: string
    toggleAsr: string
    toggleInfo: string
    openSettings: string
    closeSettings: string
  }
  emptyState: {
    title: string
    description: string
    openVideo: string
  }
  controls: {
    previous: string
    play: string
    pause: string
    next: string
    stop: string
    stopAndReset: string
    mute: string
    fullscreen: string
    playbackPosition: string
    volume: string
    playbackSpeed: string
  }
  subtitleDisplay: {
    menuLabel: string
    fontSize: string
    fontSizeValue: (value: number) => string
    decreaseFontSize: string
    increaseFontSize: string
    lineHeight: string
    displayMode: string
    translationUnavailable: string
    reset: string
    lineHeightOptions: Record<SubtitleLineHeight, string>
    displayModeOptions: Record<SubtitleDisplayMode, string>
  }
  panels: {
    playlistKicker: string
    playlistTitle: string
    noMedia: string
    asrKicker: string
    asrTitle: string
    subtitlesKicker: string
    subtitlesTitle: string
    infoKicker: string
    infoTitle: string
    currentFile: string
    containerFormat: string
    fileSize: string
    duration: string
    overallBitrate: string
    fullPath: string
    mediaUrl: string
    videoStream: string
    resolution: string
    frameRate: string
    videoCodec: string
    displayAspectRatio: string
    audioStream: string
    audioCodec: string
    channels: string
    sampleRate: string
    audioBitrate: string
    playbackState: string
    subtitleCache: string
    noSubtitles: string
    subtitleStatusIdle: string
    subtitleStatusCached: string
    subtitleStatusReady: string
    loadedToPlayer: string
    vtt: string
    srt: string
    openAsrPanel: string
    asrSubtitleTrack: string
    moreDetails: string
  }
  mediaDetailsDialog: {
    title: string
    description: string
    close: string
    sourceLabel: string
    formatTitle: string
    streamsTitle: string
    noDetails: string
  }
    asrPanel: {
      engineStatus: string
      refreshEngine: string
      detectingEngine: string
      engineReady: string
      engineNotReady: string
      modelFiles: string
      translationLanguagePair: string
      translationTargetLanguage: string
      subtitleLanguage: string
      translationModel: string
      translationServiceStatus: string
      translationServiceReady: string
      translationServiceNotChecked: string
      translationServiceUnavailable: string
      generateSubtitle: string
      generatingSubtitle: string
      translateSubtitle: (languageLabel: string) => string
      translatingSubtitle: string
      translationProgress: (completedBatches: number, totalBatches: number) => string
      cancelTranslation: string
      translatedSubtitleReady: string
      subtitleTools: string
    subtitleToolsMenu: string
    openSubtitleFolder: string
    openSrtFile: string
    openTranslatedSrtFile: string
    copySrtPath: string
    copyTranslatedSrtPath: string
    copyVttPath: string
    copyTranslatedVttPath: string
    exportSrt: string
    noModel: string
    cacheState: string
    modelSource: string
    subtitlesReady: string
    subtitlesWaiting: string
    clipExport: string
  }
  clipExportDialog: {
    title: string
    description: string
    lengthTitle: string
    lengthOptions: Record<ClipExportLengthSeconds, string>
    modeTitle: string
    modeOptions: Record<ClipExportMode, { label: string; description: string }>
    subtitleRequired: string
    cancel: string
    export: string
  }
  downloadDialog: {
    title: string
    description: (fileName: string, sizeLabel: string) => string
    close: string
    sourceDomestic: string
    sourceInternational: string
    defaultBadge: string
    sourceAria: (sourceName: string) => string
  }
  settingsDialog: {
    title: string
    description: string
    tabs: Record<AppSettingsSectionId, string>
    tabAria: Record<AppSettingsSectionId, string>
    restoreDefaults: string
    openAsrPanel: string
    note: string
    comingSoon: string
    general: {
      title: string
      language: string
      startupPanel: string
      startupPanelDescription: string
      defaultFolder: string
      selectFolderDialogTitle: string
      selectFolder: string
      clearFolder: string
      autoLoadDirectoryFiles: string
      autoLoadDirectoryFilesDescription: string
    }
    interface: {
      title: string
      rememberVolume: string
      rememberVolumeDescription: string
      rememberPlaybackRate: string
      rememberPlaybackRateDescription: string
      rememberProgress: string
      rememberProgressDescription: string
      singleClickPause: string
      singleClickPauseDescription: string
      pauseWhenMinimized: string
      pauseWhenMinimizedDescription: string
      autoHideControlDeck: string
      autoHideControlDeckDescription: string
      autoHideControlDeckDelay: string
      secondsUnit: string
      showTotalPlaybackTime: string
      showTotalPlaybackTimeDescription: string
    }
    video: {
      title: string
      seekStepSeconds: string
      seekStepSecondsDescription: string
      holdRightArrowSpeed: string
      holdRightArrowSpeedDescription: string
      hardwareAcceleration: string
      hardwareAccelerationDescription: string
    }
    subtitles: {
      title: string
      displayHeading: string
      fontSize: string
      fontSizeDescription: string
      lineHeight: string
      lineHeightDescription: string
      displayMode: string
      displayModeDescription: string
      targetLanguage: string
      targetLanguageDescription: string
      subtitleLanguage: string
      subtitleLanguageDescription: string
      autoLoadCachedSubtitles: string
      autoLoadCachedSubtitlesDescription: string
      modelSource: string
      modelSourceDescription: string
      translationServiceTitle: string
      translationServiceDescription: string
      translationBaseUrl: string
      translationBaseUrlDescription: string
      translationModel: string
      translationModelDescription: string
      translationApiKey: string
      translationApiKeyDescription: string
      translationGlossary: string
      translationGlossaryDescription: string
      translationServiceCheckTitle: string
      translationServiceCheckDescription: string
      translationServiceCheck: string
      translationServiceChecking: string
      translationServiceResultTitle: string
      translationServicePreviewTitle: string
    }
    capture: {
      title: string
      description: string
      saveFolder: string
      saveFolderDescription: string
      selectFolderDialogTitle: string
      selectFolder: string
      copyToClipboard: string
      copyToClipboardDescription: string
      imageFormat: string
      imageFormatDescription: string
      fileNaming: string
      fileNamingDescription: string
      gifFrameRate: string
      gifFrameRateDescription: string
      gifResolution: string
      gifResolutionDescription: string
      formats: {
        jpg: string
        png: string
      }
      namingOptions: {
        sequential: string
        timestamp: string
      }
      resolutionOptions: {
        '360p': string
        '480p': string
        '720p': string
      }
    }
    shortcuts: {
      title: string
      description: string
    }
  }
  modelView: {
    missing: (name: string, ramRequirement: string) => string
    downloading: (sourceName: string) => string
    installedNeedsWhisper: string
    installedNeedsFfmpeg: string
    installedReady: string
    missingLabel: string
    downloadingLabel: string
    installedLabel: string
    downloadRecommended: string
    redownload: string
  }
  messages: {
    noSubtitleFolder: string
    noSrtFile: string
    noCopyContent: string
    copied: string
  }
  runtime: {
    asrEngineMissing: string
    ffmpegMissing: string
    detectedWhisper: (version?: string | null) => string
    detectedWhisperWithoutModels: (modelFileName: string) => string
    modelDownloaded: (modelName: string) => string
    needModel: (recommendedModel: string) => string
    playbackStartFailed: (detail: string) => string
    mediaReadFailed: (detail: string) => string
    videoDecodeFailed: (detail: string) => string
    mediaSourceNotSupported: (detail: string) => string
    playbackFailed: (detail: string) => string
    mediaReadFallback: string
    videoDecodeFallback: string
    mediaSourceNotSupportedFallback: string
    unknownMediaError: (code: number) => string
    subtitleGenerated: string
    subtitleCacheMiss: string
    subtitleCacheHit: string
    subtitleExported: string
      subtitleTranslated: string
      subtitleTranslationCanceled: string
      translationServiceMissing: string
      translationServiceReady: (model: string) => string
      translationServiceNetworkError: string
      translationServiceHttpError: (status: number, statusText: string | null) => string
      translationServiceInvalidJson: string
      translationServiceInvalidResponse: string
      translationServiceEmptyResponse: string
      clipExportSuccess: string
    clipExportWithSubtitleSuccess: string
    clipExportBurnedSuccess: string
    clipExportFailed: string
    clipExportSubtitleMissing: string
    modelAlreadyCached: string
    modelDownloadStart: (sourceName: string) => string
    modelDownloading: string
    modelDownloadComplete: string
    preparingSubtitleCache: string
    extractingAudio: string
    transcribing: string
    asrGpuFallback: string
    noSubtitleFiles: string
    openMpvMissing: string
    openMpvDetected: (versionOrPath: string) => string
    stopNativePlayer: string
  }
  runtimeDialog: {
    autoDetectTitle: string
    autoDetectMessage: string
    autoDetectSuccess: (path: string) => string
    selectWhisperTitle: string
    selectWhisperMessage: string
    selectWhisperCancel: string
    selectWhisperSuccess: (path: string) => string
    selectWhisperCompatSuccess: (path: string) => string
    selectWhisperFailed: string
    clipExportSaveTitle: string
    clipExportSaveConfirm: string
  }
  asrModelStatus: {
    missing: string
    downloading: string
    installedNeedsRuntime: string
    installedReady: string
    progressLabel: string
  }
  modelSources: Record<AsrModelSourceId, { title: string; description: string; hint: string; region: string }>
  probeFieldLabels: Record<string, string>
}

const APP_COPY: Record<AppLocale, LocaleCopy> = {
  'zh-CN': {
    appName: 'AIVPlayer',
    languageOptions: {
      'zh-CN': { label: '简体中文', description: '界面、提示和设置使用简体中文。' },
      'en-US': { label: 'English', description: 'Use English for the interface and prompts.' },
      'ja-JP': { label: '日本語', description: 'インターフェースと案内を日本語にします。' },
      'ko-KR': { label: '한국어', description: '인터페이스와 안내를 한국어로 표시합니다.' }
    },
    subtitleLanguageOptions: {
      auto: { label: '自动', description: '让 whisper.cpp 自动识别语音语言。' },
      zh: { label: '中文', description: '优先按中文进行字幕识别。' },
      en: { label: '英语', description: '优先按英语进行字幕识别。' },
      ja: { label: '日语', description: '优先按日语进行字幕识别。' },
      ko: { label: '韩语', description: '优先按韩语进行字幕识别。' }
    },
    topbar: {
      openFiles: '打开媒体文件',
      togglePlaylist: '切换播放列表',
      toggleAsr: '切换 ASR 面板',
      toggleInfo: '显示或隐藏媒体信息',
      openSettings: '打开设置',
      closeSettings: '关闭设置'
    },
    emptyState: {
      title: 'AIVPlayer',
      description: '拖入视频文件，或从本机选择媒体开始播放。',
      openVideo: '打开视频'
    },
    controls: {
      previous: '上一条',
      play: '播放',
      pause: '暂停',
      next: '下一条',
      stop: '停止',
      stopAndReset: '停止并回到开头',
      mute: '静音',
      fullscreen: '全屏',
      playbackPosition: '播放进度',
      volume: '音量',
      playbackSpeed: '播放速度'
    },
    subtitleDisplay: {
      menuLabel: '字幕显示设置',
      fontSize: '字号',
      fontSizeValue: (value) => `${value}px`,
      decreaseFontSize: '减小字幕字号',
      increaseFontSize: '增大字幕字号',
      lineHeight: '行高',
      displayMode: '显示模式',
      translationUnavailable: '译文模式会在翻译字幕生成后可用。',
      reset: '恢复默认',
      lineHeightOptions: {
        compact: '紧凑',
        normal: '标准',
        relaxed: '宽松'
      },
      displayModeOptions: {
        source: '原文',
        translation: '译文',
        bilingual: '双语'
      }
    },
    panels: {
      playlistKicker: '队列',
      playlistTitle: '播放列表',
      noMedia: '还没有媒体文件。',
      asrKicker: 'ASR',
      asrTitle: 'ASR 面板',
      subtitlesKicker: '字幕',
      subtitlesTitle: '字幕轨道',
      infoKicker: '信息',
      infoTitle: '媒体信息',
      currentFile: '当前文件',
      containerFormat: '封装格式',
      fileSize: '文件大小',
      duration: '时长',
      overallBitrate: '总体码率',
      fullPath: '完整路径',
      mediaUrl: '媒体 URL',
      videoStream: '视频流',
      resolution: '分辨率',
      frameRate: '帧率',
      videoCodec: '视频编码',
      displayAspectRatio: '显示比例',
      audioStream: '音频流',
      audioCodec: '音频编码',
      channels: '声道',
      sampleRate: '采样率',
      audioBitrate: '音频码率',
      playbackState: '播放状态',
      subtitleCache: '字幕缓存',
      noSubtitles: '还没有载入字幕轨道。',
      subtitleStatusIdle: '等待生成',
      subtitleStatusCached: '缓存已就绪',
      subtitleStatusReady: '已挂载',
      loadedToPlayer: '已载入到播放器',
      vtt: 'VTT',
      srt: 'SRT',
      openAsrPanel: '打开 ASR 面板',
      asrSubtitleTrack: 'ASR 字幕',
      moreDetails: '查看完整详情'
    },
    mediaDetailsDialog: {
      title: '完整媒体详情',
      description: '点击可查看由 ffprobe 提取的完整格式与流字段。',
      close: '关闭',
      sourceLabel: '探测来源',
      formatTitle: '格式信息',
      streamsTitle: '流信息',
      noDetails: '当前没有可展示的详细探测数据。'
    },
    asrPanel: {
      engineStatus: 'ASR 引擎状态',
      refreshEngine: '刷新 ASR 引擎状态',
      detectingEngine: '正在检测 ASR 引擎...',
      engineReady: '引擎就绪',
      engineNotReady: '引擎未就绪',
      modelFiles: '模型文件',
      translationLanguagePair: '语言对',
      translationTargetLanguage: '目标语言',
      subtitleLanguage: '识别语言',
      translationModel: '翻译模型',
      translationServiceStatus: '服务状态',
      translationServiceReady: '可用',
      translationServiceNotChecked: '未检测',
      translationServiceUnavailable: '不可用',
      generateSubtitle: '生成字幕',
      generatingSubtitle: '生成中',
      translateSubtitle: (languageLabel) => `翻译为${languageLabel}`,
      translatingSubtitle: '翻译中',
      translationProgress: (completedBatches, totalBatches) => `正在翻译第 ${completedBatches} / ${totalBatches} 批`,
      cancelTranslation: '取消翻译',
      translatedSubtitleReady: '译文已就绪',
      subtitleTools: '字幕工具',
      subtitleToolsMenu: '字幕工具菜单',
      openSubtitleFolder: '打开字幕文件夹',
      openSrtFile: '打开原文 SRT 文件',
      openTranslatedSrtFile: '打开译文 SRT 文件',
      copySrtPath: '复制原文 SRT 路径',
      copyTranslatedSrtPath: '复制译文 SRT 路径',
      copyVttPath: '复制原文 VTT 路径',
      copyTranslatedVttPath: '复制译文 VTT 路径',
      exportSrt: '导出原文 SRT',
      clipExport: '导出片段',
      noModel: '未安装推荐模型',
      cacheState: '字幕缓存',
      modelSource: '模型源',
      subtitlesReady: 'VTT / SRT / 本地缓存',
      subtitlesWaiting: '等待生成'
    },
    clipExportDialog: {
      title: '一键片段导出',
      description: '从当前播放位置向后导出一个片段，导出设置会记住上次选择。',
      lengthTitle: '片段长度',
      lengthOptions: {
        15: '15 秒',
        30: '30 秒',
        60: '60 秒'
      },
      modeTitle: '导出方式',
      modeOptions: {
        video: {
          label: '纯视频',
          description: '只导出视频片段，不附带字幕。'
        },
        'external-subtitle': {
          label: '外挂字幕',
          description: '导出视频片段，并生成同名 SRT 字幕。'
        },
        'burn-subtitle': {
          label: '烧录字幕',
          description: '将字幕直接烧录进视频。'
        }
      },
      subtitleRequired: '当前没有可用字幕，只能选择纯视频导出。',
      cancel: '取消',
      export: '导出'
    },
    downloadDialog: {
      title: '选择 ASR 模型下载源',
      description: (fileName, sizeLabel) =>
        `中国大陆网络建议走阿里云 ModelScope；海外用户或已经配置稳定国际代理时，走 Hugging Face。设置里的默认源会排在第一位并标记为默认。两个源下载的是同一个 ${fileName}，约 ${sizeLabel}。`,
      close: '关闭下载源选择',
      sourceDomestic: '国内下载 ModelScope',
      sourceInternational: '国际下载 Hugging Face',
      defaultBadge: '默认',
      sourceAria: (sourceName) => `从 ${sourceName} 下载推荐 ASR 模型`
    },
    settingsDialog: {
      title: '偏好设置',
      description: '所有偏好都会自动保存到本地，下次启动继续生效。',
      tabs: {
        general: '通用',
        interface: '界面',
        video: '视频',
        subtitles: '字幕',
        capture: '截图和录屏',
        shortcuts: '快捷键'
      },
      tabAria: {
        general: '跳到通用设置',
        interface: '跳到界面设置',
        video: '跳到视频设置',
        subtitles: '跳到字幕设置',
        capture: '跳到截图和录屏设置',
        shortcuts: '跳到快捷键设置'
      },
      restoreDefaults: '恢复默认设置',
      openAsrPanel: '打开 ASR 面板',
      note: '截图和录屏设置已经可以编辑，快捷键功能后续再补。',
      comingSoon: '快捷键自定义暂未实现，后续会继续补齐。',
      general: {
        title: '通用',
        language: '界面语言',
        startupPanel: '启动后默认打开的面板',
        startupPanelDescription: '启动时会直接切到这里，减少重复点击。',
        defaultFolder: '媒体默认文件夹',
        selectFolderDialogTitle: '选择媒体默认文件夹',
        selectFolder: '选择文件夹',
        clearFolder: '清除',
        autoLoadDirectoryFiles: '自动加载同目录媒体文件',
        autoLoadDirectoryFilesDescription: '打开一个媒体文件时，顺手把同目录下的其他视频也加进播放列表。'
      },
      interface: {
        title: '界面',
        rememberVolume: '记住音量和静音状态',
        rememberVolumeDescription: '下次打开视频时沿用最近一次的音量和静音状态。',
        rememberPlaybackRate: '记住倍速',
        rememberPlaybackRateDescription: '播放速率会保留到下次启动。',
      rememberProgress: '记住播放进度',
      rememberProgressDescription: '重新打开同一个文件时，回到上次停留的位置。',
      singleClickPause: '单击画面暂停 / 恢复',
      singleClickPauseDescription: '点击视频画面即可切换播放状态，适合鼠标操作。',
      pauseWhenMinimized: '最小化窗口时自动暂停',
      pauseWhenMinimizedDescription: '窗口退到后台或被最小化时自动暂停播放。',
      autoHideControlDeck: '自动隐藏播放控制条',
      autoHideControlDeckDescription: '播放时在一段时间无操作后，自动收起底部控制条。',
      autoHideControlDeckDelay: '自动隐藏延迟',
      secondsUnit: '秒',
      showTotalPlaybackTime: '显示总时间而不是剩余时间',
      showTotalPlaybackTimeDescription: '关闭后右侧时间会显示剩余时长，开启后显示总时长。'
    },
      video: {
        title: '视频',
        seekStepSeconds: '快进 / 快退间隔',
        seekStepSecondsDescription: '键盘左右方向键的默认跳转步长。',
        holdRightArrowSpeed: '长按右方向键时倍速播放',
        holdRightArrowSpeedDescription: '按住右方向键一段时间后，临时切到更高倍速。',
        hardwareAcceleration: '硬件加速',
        hardwareAccelerationDescription: '当前构建会默认使用浏览器硬件加速。'
      },
      subtitles: {
        title: '字幕',
        displayHeading: '字幕显示',
        fontSize: '字幕字号',
        fontSizeDescription: '控制播放器字幕栏中文本的默认大小。',
        lineHeight: '字幕行高',
        lineHeightDescription: '控制多行字幕之间的垂直间距。',
        displayMode: '默认显示模式',
        displayModeDescription: '翻译功能上线后可在原文、译文和双语之间切换。',
        targetLanguage: '目标翻译语言',
        targetLanguageDescription: '翻译字幕默认输出到这个语言。',
        subtitleLanguage: '默认字幕语言',
        subtitleLanguageDescription: '生成字幕时优先使用这个语言，或保持自动识别。',
        autoLoadCachedSubtitles: '自动加载本地字幕缓存',
        autoLoadCachedSubtitlesDescription: '重新打开同一个视频时，优先命中缓存中的 VTT / SRT。',
        modelSource: 'ASR 模型默认下载源',
        modelSourceDescription: '下载弹窗会优先把这里选中的源排在前面。',
        translationServiceTitle: '翻译服务',
        translationServiceDescription: '填写 OpenAI-compatible Chat Completions 接口后，字幕就能直接翻译成目标语言。API key 会使用系统安全存储加密保存在本机。',
        translationBaseUrl: '翻译接口地址',
        translationBaseUrlDescription: '填写完整的 Chat Completions 接口地址，例如 /v1/chat/completions。',
        translationModel: '翻译模型',
        translationModelDescription: '填写用于翻译的模型名，例如 mimo-v2.5。',
        translationApiKey: 'API Key',
        translationApiKeyDescription: 'API Key 会加密保存在本机，不会以明文写入普通设置文件。',
        translationGlossary: '术语表',
        translationGlossaryDescription: '每行填写一条固定译法，格式为“原词=固定译词”，例如 Technology=技术。',
        translationServiceCheckTitle: '翻译服务自检',
        translationServiceCheckDescription: '发送一条样例字幕给当前接口，确认模型和 API Key 能返回可解析的结果。',
        translationServiceCheck: '测试翻译服务',
        translationServiceChecking: '测试中',
        translationServiceResultTitle: '测试结果',
        translationServicePreviewTitle: '预览结果',
      },
      capture: {
        title: '截图和录屏',
        description: '先把截图和录屏的默认目录、文件命名和 GIF 参数保存好，后续功能会直接沿用。',
        saveFolder: '保存文件夹',
        saveFolderDescription: '截图和录屏文件会默认存到这里。',
        selectFolderDialogTitle: '选择截图和录屏保存文件夹',
        selectFolder: '选择文件夹',
        copyToClipboard: '同时复制到剪贴板',
        copyToClipboardDescription: '保存截图后自动把结果复制到剪贴板，方便直接粘贴。',
        imageFormat: '图片格式',
        imageFormatDescription: '截图默认使用的图片文件格式。',
        fileNaming: '图片命名',
        fileNamingDescription: '截图文件的默认命名方式。',
        gifFrameRate: 'GIF 帧率',
        gifFrameRateDescription: '导出 GIF 时每秒保留多少帧。',
        gifResolution: 'GIF 分辨率',
        gifResolutionDescription: '导出 GIF 时使用的默认分辨率。',
        formats: {
          jpg: 'JPG',
          png: 'PNG'
        },
        namingOptions: {
          sequential: '顺序',
          timestamp: '时间戳'
        },
        resolutionOptions: {
          '360p': '360p',
          '480p': '480p',
          '720p': '720p'
        }
      },
      shortcuts: {
        title: '快捷键',
        description: '快捷键设置先不实现，后续如果补键位配置，会沿用这个入口。'
      }
    },
    modelView: {
      missing: (name, ramRequirement) => `推荐 ${name}，${ramRequirement}。`,
      downloading: (sourceName) => `正在从 ${sourceName} 下载推荐模型文件。`,
      installedNeedsWhisper: '模型文件已就绪；字幕生成还缺 ASR 引擎 whisper.cpp。',
      installedNeedsFfmpeg: '模型文件已就绪；字幕生成还缺 ffmpeg。',
      installedReady: '模型文件已就绪，可用于本地字幕生成。',
      missingLabel: '模型文件未安装',
      downloadingLabel: '模型文件下载中',
      installedLabel: '模型文件已安装',
      downloadRecommended: '下载推荐模型',
      redownload: '重新下载 / 更换来源'
    },
    messages: {
      noSubtitleFolder: '无法打开字幕文件夹，请检查文件是否还存在。',
      noSrtFile: '无法打开 SRT 文件，请检查系统默认应用或文件是否还存在。',
      noCopyContent: '没有可复制的内容。',
      copied: '已复制到剪贴板。'
    },
    runtime: {
      asrEngineMissing:
        '未找到内置 ASR 引擎组件。正式安装包应内置 whisper.cpp；开发调试时可选择 whisper.cpp CLI，或将它放到 resources/whisper.cpp。',
      ffmpegMissing:
        '未找到内置音频处理组件 ffmpeg。正式安装包应内置 ffmpeg；开发调试时可将它放到 resources/ffmpeg。',
      detectedWhisper: (version) => (version ? `已检测到 whisper.cpp：${version}` : '已检测到 whisper.cpp'),
      detectedWhisperWithoutModels: (modelFileName) =>
        `已检测到 whisper.cpp 和 ffmpeg，但模型目录暂无模型；建议下载 ${modelFileName}。`,
      modelDownloaded: (modelName) => `模型已就绪：${modelName}`,
      needModel: (recommendedModel) => `还没有可用 ASR 模型，请先下载 ${recommendedModel}。`,
      playbackStartFailed: (detail) => `播放器启动失败：${detail}`,
      mediaReadFailed: (detail) => `媒体读取失败：${detail}`,
      videoDecodeFailed: (detail) => `视频解码失败：${detail}`,
      mediaSourceNotSupported: (detail) => `媒体源不受支持或无法读取：${detail}`,
      playbackFailed: (detail) => `播放失败：${detail}`,
      mediaReadFallback: '文件读取过程中发生网络 / 文件系统错误。',
      videoDecodeFallback: '当前 Electron / Chromium 解码器无法继续解码这个文件。',
      mediaSourceNotSupportedFallback: '请确认文件路径、封装格式和编码是否可用。',
      unknownMediaError: (code) => `未知媒体错误 ${code}。`,
      subtitleGenerated: '字幕生成完成，VTT 已挂载，SRT 已导出。',
      subtitleCacheMiss: '未命中本地字幕缓存。',
      subtitleCacheHit: '已命中本地字幕缓存（VTT / SRT）。',
      subtitleExported: '已根据 VTT 导出 SRT。',
      subtitleTranslated: '字幕翻译完成，译文 VTT 已挂载，SRT 已导出。',
      subtitleTranslationCanceled: '字幕翻译已取消，未生成新的译文缓存。',
      translationServiceMissing:
        '翻译服务未配置。请在设置中填写接口地址、模型和 API Key，或通过环境变量 AIVPLAYER_TRANSLATION_BASE_URL、AIVPLAYER_TRANSLATION_API_KEY 和 AIVPLAYER_TRANSLATION_MODEL 启用。',
      translationServiceReady: (model) => `翻译服务可用，${model} 已返回有效结果。`,
      translationServiceNetworkError: '翻译服务网络请求失败。',
      translationServiceHttpError: (status, statusText) =>
        `翻译接口返回 HTTP ${status}${statusText ? ` ${statusText}` : ''}。`,
      translationServiceInvalidJson: '翻译接口返回了无法解析的 JSON。',
      translationServiceInvalidResponse: '翻译接口返回了无效的响应内容。',
      translationServiceEmptyResponse: '翻译接口返回了空结果。',
      clipExportSuccess: '片段导出完成。',
      clipExportWithSubtitleSuccess: '片段和外挂字幕导出完成。',
      clipExportBurnedSuccess: '片段导出完成，字幕已烧录。',
      clipExportFailed: '片段导出失败',
      clipExportSubtitleMissing: '没有可用字幕，无法导出带字幕的片段。',
      modelAlreadyCached: '模型已存在，直接使用本地缓存。',
      modelDownloadStart: (sourceName) => `开始从 ${sourceName} 下载 ASR 模型。`,
      modelDownloading: '模型下载中。',
      modelDownloadComplete: '模型下载完成。',
      preparingSubtitleCache: '正在准备音频和字幕缓存。',
      extractingAudio: '正在用 ffmpeg 抽取 16k 单声道音频。',
      transcribing: '正在用 whisper.cpp 识别语音并生成 VTT / SRT 字幕。',
      asrGpuFallback: 'GPU 加速暂不可用，正在回退到 CPU 继续识别。',
      noSubtitleFiles: 'whisper.cpp 已结束，但没有同时生成预期的 VTT / SRT 字幕文件。',
      openMpvMissing: '未找到 mpv。可以安装 mpv，或设置 AIVPLAYER_MPV_BIN 指向 mpv 可执行文件。',
      openMpvDetected: (versionOrPath) => `已检测到 mpv：${versionOrPath}`,
      stopNativePlayer: '当前版本未启用外部 mpv 播放进程。'
    },
    runtimeDialog: {
      autoDetectTitle: '自动检测 whisper.cpp',
      autoDetectMessage:
        '已自动检测到 ASR 引擎。若正式安装包里缺组件，请重新安装 AIVPlayer；开发调试时也可以手动选择 whisper.cpp 可执行文件。',
      autoDetectSuccess: (path) => `已自动检测到 ASR 引擎：${path}`,
      selectWhisperTitle: '选择 whisper.cpp 可执行文件',
      selectWhisperMessage: '请选择 whisper.cpp 编译生成的可执行文件。',
      selectWhisperCancel: '已取消选择 ASR 引擎。',
      selectWhisperSuccess: (path) => `已选择 ASR 引擎：${path}`,
      selectWhisperCompatSuccess: (path) => `已选择 ASR 引擎：${path}（已自动切换到兼容版本）`,
      selectWhisperFailed: '选择的文件暂时无法作为 ASR 引擎使用。',
      clipExportSaveTitle: '选择片段导出位置',
      clipExportSaveConfirm: '导出'
    },
    asrModelStatus: {
      missing: '模型文件未安装',
      downloading: '模型文件下载中',
      installedNeedsRuntime: '模型文件已安装',
      installedReady: '模型文件已安装',
      progressLabel: '处理中'
    },
    modelSources: {
      modelscope: {
        title: 'ModelScope',
        description: '阿里云魔搭社区镜像源，适合中国大陆网络，通常不需要额外代理。',
        hint: '推荐给国内网络',
        region: '中国大陆'
      },
      huggingface: {
        title: 'Hugging Face',
        description: 'whisper.cpp 官方模型源，适合海外网络，或已经配置稳定国际代理的环境。',
        hint: '推荐给海外网络',
        region: '国际'
      }
    },
    probeFieldLabels: {
      'filename': '文件名',
      'nb_streams': '流数量',
      'nb_programs': '节目数量',
      'nb_stream_groups': '流组数量',
      'format_name': '格式名称',
      'format_long_name': '格式全称',
      'start_time': '起始时间',
      'duration': '时长',
      'duration_ts': '持续时间 TS',
      'size': '大小',
      'bit_rate': '码率',
      'probe_score': '探测评分',
      'tags.major_brand': '主要品牌',
      'tags.minor_version': '次要版本',
      'tags.compatible_brands': '兼容品牌',
      'tags.encoder': '编码器',
      'tags.comment': '备注',
      'tags.language': '语言',
      'tags.handler_name': '处理器名称',
      'codec_name': '编码名称',
      'codec_long_name': '编码全称',
      'codec_type': '编码类型',
      'codec_tag': '编码标签',
      'codec_tag_string': '编码标签字符串',
      'profile': '配置文件',
      'width': '宽度',
      'height': '高度',
      'coded_width': '编码宽度',
      'coded_height': '编码高度',
      'closed_captions': '隐藏字幕',
      'film_grain': '胶片颗粒',
      'has_b_frames': 'B 帧',
      'sample_aspect_ratio': '采样宽高比',
      'display_aspect_ratio': '显示宽高比',
      'pix_fmt': '像素格式',
      'level': '级别',
      'color_range': '色彩范围',
      'color_space': '色彩空间',
      'color_transfer': '色彩传输',
      'color_primaries': '色彩原色',
      'chroma_location': '色度位置',
      'field_order': '场序',
      'refs': '参考帧',
      'r_frame_rate': '帧率',
      'avg_frame_rate': '平均帧率',
      'time_base': '时间基准',
      'start_pts': '起始 PTS',
      'start_time.2': '起始时间',
      'extradata_size': '额外数据大小',
      'disposition.default': '默认',
      'disposition.dub': '配音',
      'disposition.original': '原始',
      'disposition.comment': '评论',
      'disposition.lyrics': '歌词',
      'disposition.karaoke': '卡拉OK',
      'disposition.forced': '强制',
      'disposition.hearing_impaired': '听力障碍',
      'disposition.visual_impaired': '视觉障碍',
      'disposition.clean_effects': '清洁效果',
      'disposition.attached_pic': '附加图片',
      'disposition.timed_thumbnails': '定时缩略图',
      'disposition.non_diegetic': '非叙事',
      'disposition.captions': '字幕',
      'disposition.descriptions': '描述',
      'disposition.metadata': '元数据',
      'disposition.dependent': '依赖',
      'disposition.still_image': '静态图片',
      'disposition.multilayer': '多层',
      'channel_layout': '声道布局',
      'channels': '声道数',
      'bits_per_sample': '采样位数',
      'sample_fmt': '采样格式',
      'sample_rate': '采样率'
    }
  },
  'en-US': {
    appName: 'AIVPlayer',
    languageOptions: {
      'zh-CN': { label: '简体中文', description: 'Use Simplified Chinese for the interface and prompts.' },
      'en-US': { label: 'English', description: 'Use English for the interface and prompts.' },
      'ja-JP': { label: '日本語', description: 'Use Japanese for the interface and prompts.' },
      'ko-KR': { label: '한국어', description: 'Use Korean for the interface and prompts.' }
    },
    subtitleLanguageOptions: {
      auto: { label: 'Auto', description: 'Let whisper.cpp detect the spoken language automatically.' },
      zh: { label: 'Chinese', description: 'Prefer Chinese when transcribing subtitles.' },
      en: { label: 'English', description: 'Prefer English when transcribing subtitles.' },
      ja: { label: 'Japanese', description: 'Prefer Japanese when transcribing subtitles.' },
      ko: { label: 'Korean', description: 'Prefer Korean when transcribing subtitles.' }
    },
    topbar: {
      openFiles: 'Open media files',
      togglePlaylist: 'Toggle playlist',
      toggleAsr: 'Toggle ASR panel',
      toggleInfo: 'Show or hide media info',
      openSettings: 'Open settings',
      closeSettings: 'Close settings'
    },
    emptyState: {
      title: 'AIVPlayer',
      description: 'Drop in a video or choose local media to start playing.',
      openVideo: 'Open video'
    },
    controls: {
      previous: 'Previous',
      play: 'Play',
      pause: 'Pause',
      next: 'Next',
      stop: 'Stop',
      stopAndReset: 'Stop and return to start',
      mute: 'Mute',
      fullscreen: 'Fullscreen',
      playbackPosition: 'Playback position',
      volume: 'Volume',
      playbackSpeed: 'Playback speed'
    },
    subtitleDisplay: {
      menuLabel: 'Subtitle display settings',
      fontSize: 'Font size',
      fontSizeValue: (value) => `${value}px`,
      decreaseFontSize: 'Decrease subtitle font size',
      increaseFontSize: 'Increase subtitle font size',
      lineHeight: 'Line height',
      displayMode: 'Display mode',
      translationUnavailable: 'Translated modes become available after translated subtitles are generated.',
      reset: 'Reset defaults',
      lineHeightOptions: {
        compact: 'Compact',
        normal: 'Normal',
        relaxed: 'Relaxed'
      },
      displayModeOptions: {
        source: 'Source',
        translation: 'Translation',
        bilingual: 'Bilingual'
      }
    },
    panels: {
      playlistKicker: 'Queue',
      playlistTitle: 'Playlist',
      noMedia: 'No media files yet.',
      asrKicker: 'ASR',
      asrTitle: 'ASR panel',
      subtitlesKicker: 'Subtitles',
      subtitlesTitle: 'Subtitle tracks',
      infoKicker: 'Info',
      infoTitle: 'Media info',
      currentFile: 'Current file',
      containerFormat: 'Container format',
      fileSize: 'File size',
      duration: 'Duration',
      overallBitrate: 'Overall bitrate',
      fullPath: 'Full path',
      mediaUrl: 'Media URL',
      videoStream: 'Video stream',
      resolution: 'Resolution',
      frameRate: 'Frame rate',
      videoCodec: 'Video codec',
      displayAspectRatio: 'Display aspect ratio',
      audioStream: 'Audio stream',
      audioCodec: 'Audio codec',
      channels: 'Channels',
      sampleRate: 'Sample rate',
      audioBitrate: 'Audio bitrate',
      playbackState: 'Playback state',
      subtitleCache: 'Subtitle cache',
      noSubtitles: 'No subtitle tracks loaded yet.',
      subtitleStatusIdle: 'Waiting',
      subtitleStatusCached: 'Cache ready',
      subtitleStatusReady: 'Mounted',
      loadedToPlayer: 'Loaded in player',
      vtt: 'VTT',
      srt: 'SRT',
      openAsrPanel: 'Open ASR panel',
      asrSubtitleTrack: 'ASR subtitles',
      moreDetails: 'View full details'
    },
    mediaDetailsDialog: {
      title: 'Full media details',
      description: 'View the full format and stream fields extracted by ffprobe.',
      close: 'Close',
      sourceLabel: 'Probe source',
      formatTitle: 'Format info',
      streamsTitle: 'Stream info',
      noDetails: 'No detailed probe data is available right now.'
    },
    asrPanel: {
      engineStatus: 'ASR engine status',
      refreshEngine: 'Refresh ASR engine status',
      detectingEngine: 'Detecting ASR engine...',
      engineReady: 'Engine ready',
      engineNotReady: 'Engine not ready',
      modelFiles: 'Model files',
      translationLanguagePair: 'Language pair',
      translationTargetLanguage: 'Target language',
      subtitleLanguage: 'Detected language',
      translationModel: 'Translation model',
      translationServiceStatus: 'Service status',
      translationServiceReady: 'Ready',
      translationServiceNotChecked: 'Not checked',
      translationServiceUnavailable: 'Unavailable',
      generateSubtitle: 'Generate subtitles',
      generatingSubtitle: 'Generating',
      translateSubtitle: (languageLabel) => `Translate to ${languageLabel}`,
      translatingSubtitle: 'Translating',
      translationProgress: (completedBatches, totalBatches) => `Translating batch ${completedBatches} / ${totalBatches}`,
      cancelTranslation: 'Cancel translation',
      translatedSubtitleReady: 'Translation ready',
      subtitleTools: 'Subtitle tools',
      subtitleToolsMenu: 'Subtitle tools menu',
      openSubtitleFolder: 'Open subtitle folder',
      openSrtFile: 'Open raw SRT file',
      openTranslatedSrtFile: 'Open translated SRT file',
      copySrtPath: 'Copy raw SRT path',
      copyTranslatedSrtPath: 'Copy translated SRT path',
      copyVttPath: 'Copy raw VTT path',
      copyTranslatedVttPath: 'Copy translated VTT path',
      exportSrt: 'Export raw SRT',
      clipExport: 'Export clip',
      noModel: 'Recommended model not installed',
      cacheState: 'Subtitle cache',
      modelSource: 'Model source',
      subtitlesReady: 'VTT / SRT / local cache',
      subtitlesWaiting: 'Waiting'
    },
    clipExportDialog: {
      title: 'One-click clip export',
      description: 'Export a short clip starting from the current playhead, and remember the last choice.',
      lengthTitle: 'Clip length',
      lengthOptions: {
        15: '15 sec',
        30: '30 sec',
        60: '60 sec'
      },
      modeTitle: 'Export mode',
      modeOptions: {
        video: {
          label: 'Video only',
          description: 'Export only the video clip, without subtitles.'
        },
        'external-subtitle': {
          label: 'External subtitles',
          description: 'Export the video clip and a matching SRT subtitle file.'
        },
        'burn-subtitle': {
          label: 'Burn subtitles',
          description: 'Render subtitles directly into the exported video.'
        }
      },
      subtitleRequired: 'No subtitles are available right now, so only video-only export can be chosen.',
      cancel: 'Cancel',
      export: 'Export'
    },
    downloadDialog: {
      title: 'Choose an ASR model download source',
      description: (fileName, sizeLabel) =>
        `For mainland China, ModelScope is the recommended source. If you are overseas or already have a stable international proxy, use Hugging Face. Your default source is shown first and marked as default. Both sources download the same ${fileName}, about ${sizeLabel}.`,
      close: 'Close download source picker',
      sourceDomestic: 'ModelScope download',
      sourceInternational: 'Hugging Face download',
      defaultBadge: 'Default',
      sourceAria: (sourceName) => `Download the recommended ASR model from ${sourceName}`
    },
    settingsDialog: {
      title: 'Preferences',
      description: 'All preferences are saved locally and applied next time you launch the app.',
      tabs: {
        general: 'General',
        interface: 'Interface',
        video: 'Video',
        subtitles: 'Subtitles',
        capture: 'Capture & record',
        shortcuts: 'Shortcuts'
      },
      tabAria: {
        general: 'Jump to General settings',
        interface: 'Jump to Interface settings',
        video: 'Jump to Video settings',
        subtitles: 'Jump to Subtitle settings',
        capture: 'Jump to Capture and record settings',
        shortcuts: 'Jump to Shortcut settings'
      },
      restoreDefaults: 'Restore defaults',
      openAsrPanel: 'Open ASR panel',
      note: 'Capture and recording settings are editable now, and shortcut customization will come later.',
      comingSoon: 'Shortcut customization is not implemented yet.',
      general: {
        title: 'General',
        language: 'Interface language',
        startupPanel: 'Default panel on launch',
        startupPanelDescription: 'Open directly to this panel when the app starts.',
        defaultFolder: 'Default media folder',
        selectFolderDialogTitle: 'Choose default media folder',
        selectFolder: 'Choose folder',
        clearFolder: 'Clear',
        autoLoadDirectoryFiles: 'Auto-load media files in the same folder',
        autoLoadDirectoryFilesDescription: 'When you open one video, also add siblings from the same folder.'
      },
      interface: {
        title: 'Interface',
        rememberVolume: 'Remember volume and muted state',
        rememberVolumeDescription: 'Reuse the last volume and mute state when you open another video.',
        rememberPlaybackRate: 'Remember playback speed',
        rememberPlaybackRateDescription: 'Keep the last playback speed for the next launch.',
      rememberProgress: 'Remember playback progress',
      rememberProgressDescription: 'Resume the same file from where you left off.',
      singleClickPause: 'Single-click the video to pause / resume',
      singleClickPauseDescription: 'Clicking the video surface toggles playback.',
      pauseWhenMinimized: 'Pause when the window is minimized',
      pauseWhenMinimizedDescription: 'Automatically pause when the window goes to the background.',
      autoHideControlDeck: 'Auto-hide playback controls',
      autoHideControlDeckDescription: 'Hide the bottom control deck after a short idle period while playback is running.',
      autoHideControlDeckDelay: 'Auto-hide delay',
      secondsUnit: 'sec',
      showTotalPlaybackTime: 'Show total time instead of remaining time',
      showTotalPlaybackTimeDescription: 'When enabled, the time on the right shows the full duration instead of the remaining time.'
    },
      video: {
        title: 'Video',
        seekStepSeconds: 'Seek step',
        seekStepSecondsDescription: 'Default jump distance for the left and right arrow keys.',
        holdRightArrowSpeed: 'Hold the right arrow for fast playback',
        holdRightArrowSpeedDescription: 'Hold the right arrow key to temporarily switch to a higher speed.',
        hardwareAcceleration: 'Hardware acceleration',
        hardwareAccelerationDescription: 'This build uses browser hardware acceleration by default.'
      },
      subtitles: {
        title: 'Subtitles',
        displayHeading: 'Subtitle display',
        fontSize: 'Subtitle font size',
        fontSizeDescription: 'Controls the default text size in the subtitle bar.',
        lineHeight: 'Subtitle line height',
        lineHeightDescription: 'Controls vertical spacing for multiline subtitles.',
        displayMode: 'Default display mode',
        displayModeDescription: 'Switch between source, translation, and bilingual modes when translation is available.',
        targetLanguage: 'Target translation language',
        targetLanguageDescription: 'Translated subtitles will default to this language.',
        subtitleLanguage: 'Default subtitle language',
        subtitleLanguageDescription: 'Use this language first, or keep auto-detect.',
        autoLoadCachedSubtitles: 'Auto-load local subtitle cache',
        autoLoadCachedSubtitlesDescription: 'Restore cached VTT / SRT when the same video is opened again.',
        modelSource: 'Preferred ASR model source',
        modelSourceDescription: 'The download dialog will show this source first.',
        translationServiceTitle: 'Translation service',
        translationServiceDescription:
          'Fill in an OpenAI-compatible Chat Completions endpoint and subtitles can be translated directly into the target language. The API key is encrypted locally with the system secure store.',
        translationBaseUrl: 'Translation endpoint',
        translationBaseUrlDescription: 'Enter the full Chat Completions endpoint, for example /v1/chat/completions.',
        translationModel: 'Translation model',
        translationModelDescription: 'Enter the model name used for translation, for example mimo-v2.5.',
        translationApiKey: 'API key',
        translationApiKeyDescription: 'The API key is encrypted locally and is never written in plain text to the normal settings file.',
        translationGlossary: 'Glossary',
        translationGlossaryDescription: 'Add one fixed translation per line as source=target, for example Technology=技术.',
        translationServiceCheckTitle: 'Translation service check',
        translationServiceCheckDescription:
          'Send a sample subtitle to the current endpoint and confirm the model and API key can return parseable output.',
        translationServiceCheck: 'Test translation service',
        translationServiceChecking: 'Testing',
        translationServiceResultTitle: 'Test result',
        translationServicePreviewTitle: 'Preview result'
      },
      capture: {
        title: 'Capture & record',
        description: 'Keep the default directory, file naming, and GIF export options ready for the future capture pipeline.',
        saveFolder: 'Save folder',
        saveFolderDescription: 'Captured screenshots and recordings will default to this folder.',
        selectFolderDialogTitle: 'Choose capture and recording folder',
        selectFolder: 'Choose folder',
        copyToClipboard: 'Copy to clipboard as well',
        copyToClipboardDescription: 'Copy the saved screenshot to the clipboard immediately after export.',
        imageFormat: 'Image format',
        imageFormatDescription: 'Default file format for screenshots.',
        fileNaming: 'File naming',
        fileNamingDescription: 'Default naming mode for screenshot files.',
        gifFrameRate: 'GIF frame rate',
        gifFrameRateDescription: 'How many frames per second to keep when exporting GIFs.',
        gifResolution: 'GIF resolution',
        gifResolutionDescription: 'Default resolution when exporting GIFs.',
        formats: {
          jpg: 'JPG',
          png: 'PNG'
        },
        namingOptions: {
          sequential: 'Sequential',
          timestamp: 'Timestamp'
        },
        resolutionOptions: {
          '360p': '360p',
          '480p': '480p',
          '720p': '720p'
        }
      },
      shortcuts: {
        title: 'Shortcuts',
        description: 'Shortcut customization is not implemented yet.'
      }
    },
    modelView: {
      missing: (name, ramRequirement) => `Recommended ${name}, ${ramRequirement}.`,
      downloading: (sourceName) => `Downloading the recommended model from ${sourceName}.`,
      installedNeedsWhisper: 'The model file is ready, but whisper.cpp is still missing.',
      installedNeedsFfmpeg: 'The model file is ready, but ffmpeg is still missing.',
      installedReady: 'The model file is ready for local subtitle generation.',
      missingLabel: 'Model not installed',
      downloadingLabel: 'Model downloading',
      installedLabel: 'Model installed',
      downloadRecommended: 'Download recommended model',
      redownload: 'Redownload / change source'
    },
    messages: {
      noSubtitleFolder: 'Could not open the subtitle folder. Please check whether the file still exists.',
      noSrtFile: 'Could not open the SRT file. Please check the default app or whether the file still exists.',
      noCopyContent: 'Nothing to copy.',
      copied: 'Copied to clipboard.'
    },
    runtime: {
      asrEngineMissing:
        'Bundled ASR components were not found. The release build should include whisper.cpp; in development you can select a whisper.cpp CLI manually or place it under resources/whisper.cpp.',
      ffmpegMissing:
        'Bundled ffmpeg was not found. The release build should include ffmpeg; in development you can place it under resources/ffmpeg.',
      detectedWhisper: (version) => (version ? `Detected whisper.cpp: ${version}` : 'Detected whisper.cpp'),
      detectedWhisperWithoutModels: (modelFileName) =>
        `Detected whisper.cpp and ffmpeg, but there are no models yet. Consider downloading ${modelFileName}.`,
      modelDownloaded: (modelName) => `Model ready: ${modelName}`,
      needModel: (recommendedModel) => `No ASR model is available yet. Please download ${recommendedModel}.`,
      playbackStartFailed: (detail) => `Player start failed: ${detail}`,
      mediaReadFailed: (detail) => `Media read failed: ${detail}`,
      videoDecodeFailed: (detail) => `Video decode failed: ${detail}`,
      mediaSourceNotSupported: (detail) => `Media source is not supported or cannot be read: ${detail}`,
      playbackFailed: (detail) => `Playback failed: ${detail}`,
      mediaReadFallback: 'A network or file-system error occurred while reading the file.',
      videoDecodeFallback: 'The current Electron/Chromium decoder could not continue decoding this file.',
      mediaSourceNotSupportedFallback: 'Please verify the file path, container format, and codec.',
      unknownMediaError: (code) => `Unknown media error ${code}.`,
      subtitleGenerated: 'Subtitle generation completed. VTT is mounted and SRT has been exported.',
      subtitleCacheMiss: 'No local subtitle cache was found.',
      subtitleCacheHit: 'Local subtitle cache hit (VTT / SRT).',
      subtitleExported: 'SRT exported from VTT.',
      subtitleTranslated: 'Subtitle translation completed. Translated VTT is mounted and SRT has been exported.',
      subtitleTranslationCanceled: 'Subtitle translation was cancelled. No new translated cache was written.',
      translationServiceMissing:
        'Translation service is not configured. Fill in the endpoint, model, and API key in settings, or set AIVPLAYER_TRANSLATION_BASE_URL, AIVPLAYER_TRANSLATION_API_KEY, and AIVPLAYER_TRANSLATION_MODEL.',
      translationServiceReady: (model) => `Translation service is ready. ${model} returned a valid result.`,
      translationServiceNetworkError: 'Translation service network request failed.',
      translationServiceHttpError: (status, statusText) =>
        `Translation endpoint returned HTTP ${status}${statusText ? ` ${statusText}` : ''}.`,
      translationServiceInvalidJson: 'Translation endpoint returned invalid JSON.',
      translationServiceInvalidResponse: 'Translation endpoint returned invalid response content.',
      translationServiceEmptyResponse: 'Translation endpoint returned an empty result.',
      clipExportSuccess: 'Clip export completed.',
      clipExportWithSubtitleSuccess: 'Clip and external subtitle export completed.',
      clipExportBurnedSuccess: 'Clip export completed with burned subtitles.',
      clipExportFailed: 'Clip export failed',
      clipExportSubtitleMissing: 'No subtitles are available, so a subtitle-based clip cannot be exported.',
      modelAlreadyCached: 'The model already exists locally.',
      modelDownloadStart: (sourceName) => `Starting to download the ASR model from ${sourceName}.`,
      modelDownloading: 'Downloading model.',
      modelDownloadComplete: 'Model download complete.',
      preparingSubtitleCache: 'Preparing audio and subtitle cache.',
      extractingAudio: 'Extracting 16 kHz mono audio with ffmpeg.',
      transcribing: 'Transcribing speech and generating VTT / SRT with whisper.cpp.',
      asrGpuFallback: 'GPU acceleration is unavailable, so transcription is continuing on the CPU.',
      noSubtitleFiles: 'whisper.cpp finished, but the expected VTT / SRT files were not created.',
      openMpvMissing: 'mpv was not found. You can install mpv or set AIVPLAYER_MPV_BIN to the mpv executable.',
      openMpvDetected: (versionOrPath) => `Detected mpv: ${versionOrPath}`,
      stopNativePlayer: 'This build does not use an external mpv playback process.'
    },
    runtimeDialog: {
      autoDetectTitle: 'Auto-detect whisper.cpp',
      autoDetectMessage:
        'ASR engine auto-detection finished. If the release build is missing components, reinstall AIVPlayer. During development you can also select the whisper.cpp executable manually.',
      autoDetectSuccess: (path) => `ASR engine auto-detected: ${path}`,
      selectWhisperTitle: 'Choose the whisper.cpp executable',
      selectWhisperMessage: 'Please choose the executable built by whisper.cpp.',
      selectWhisperCancel: 'ASR engine selection cancelled.',
      selectWhisperSuccess: (path) => `Selected ASR engine: ${path}`,
      selectWhisperCompatSuccess: (path) => `Selected ASR engine: ${path} (switched to a compatible build automatically)`,
      selectWhisperFailed: 'The selected file cannot be used as an ASR engine.',
      clipExportSaveTitle: 'Choose where to save the clip',
      clipExportSaveConfirm: 'Export'
    },
    asrModelStatus: {
      missing: 'Model not installed',
      downloading: 'Model downloading',
      installedNeedsRuntime: 'Model installed',
      installedReady: 'Model installed',
      progressLabel: 'Working'
    },
    modelSources: {
      modelscope: {
        title: 'ModelScope',
        description: 'Best for mainland China networks and usually works without an extra proxy.',
        hint: 'Recommended for mainland China',
        region: 'Mainland China'
      },
      huggingface: {
        title: 'Hugging Face',
        description: 'Best for overseas networks or a stable international proxy.',
        hint: 'Recommended for overseas networks',
        region: 'International'
      }
    },
    probeFieldLabels: {
      'filename': 'Filename',
      'nb_streams': 'Number of streams',
      'nb_programs': 'Number of programs',
      'nb_stream_groups': 'Number of stream groups',
      'format_name': 'Format name',
      'format_long_name': 'Format full name',
      'start_time': 'Start time',
      'duration': 'Duration',
      'duration_ts': 'Duration TS',
      'size': 'Size',
      'bit_rate': 'Bit rate',
      'probe_score': 'Probe score',
      'tags.major_brand': 'Major brand',
      'tags.minor_version': 'Minor version',
      'tags.compatible_brands': 'Compatible brands',
      'tags.encoder': 'Encoder',
      'tags.comment': 'Comment',
      'tags.language': 'Language',
      'tags.handler_name': 'Handler name',
      'codec_name': 'Codec name',
      'codec_long_name': 'Codec full name',
      'codec_type': 'Codec type',
      'codec_tag': 'Codec tag',
      'codec_tag_string': 'Codec tag string',
      'profile': 'Profile',
      'width': 'Width',
      'height': 'Height',
      'coded_width': 'Coded width',
      'coded_height': 'Coded height',
      'closed_captions': 'Closed captions',
      'film_grain': 'Film grain',
      'has_b_frames': 'B frames',
      'sample_aspect_ratio': 'Sample aspect ratio',
      'display_aspect_ratio': 'Display aspect ratio',
      'pix_fmt': 'Pixel format',
      'level': 'Level',
      'color_range': 'Color range',
      'color_space': 'Color space',
      'color_transfer': 'Color transfer',
      'color_primaries': 'Color primaries',
      'chroma_location': 'Chroma location',
      'field_order': 'Field order',
      'refs': 'References',
      'r_frame_rate': 'Frame rate',
      'avg_frame_rate': 'Average frame rate',
      'time_base': 'Time base',
      'start_pts': 'Start PTS',
      'start_time.2': 'Start time',
      'extradata_size': 'Extra data size',
      'disposition.default': 'Default',
      'disposition.dub': 'Dub',
      'disposition.original': 'Original',
      'disposition.comment': 'Comment',
      'disposition.lyrics': 'Lyrics',
      'disposition.karaoke': 'Karaoke',
      'disposition.forced': 'Forced',
      'disposition.hearing_impaired': 'Hearing impaired',
      'disposition.visual_impaired': 'Visual impaired',
      'disposition.clean_effects': 'Clean effects',
      'disposition.attached_pic': 'Attached picture',
      'disposition.timed_thumbnails': 'Timed thumbnails',
      'disposition.non_diegetic': 'Non-diegetic',
      'disposition.captions': 'Captions',
      'disposition.descriptions': 'Descriptions',
      'disposition.metadata': 'Metadata',
      'disposition.dependent': 'Dependent',
      'disposition.still_image': 'Still image',
      'disposition.multilayer': 'Multilayer',
      'channel_layout': 'Channel layout',
      'channels': 'Channels',
      'bits_per_sample': 'Bits per sample',
      'sample_fmt': 'Sample format',
      'sample_rate': 'Sample rate'
    }
  },
  'ja-JP': {
    appName: 'AIVPlayer',
    languageOptions: {
      'zh-CN': { label: '简体中文', description: 'インターフェースと案内を簡体中文で表示します。' },
      'en-US': { label: 'English', description: 'インターフェースと案内を英語で表示します。' },
      'ja-JP': { label: '日本語', description: 'インターフェースと案内を日本語で表示します。' },
      'ko-KR': { label: '한국어', description: 'インターフェースと案内を韓国語で表示します。' }
    },
    subtitleLanguageOptions: {
      auto: { label: '自動', description: 'whisper.cpp に話し言葉の言語を自動判定させます。' },
      zh: { label: '中国語', description: '字幕生成では中国語を優先します。' },
      en: { label: '英語', description: '字幕生成では英語を優先します。' },
      ja: { label: '日本語', description: '字幕生成では日本語を優先します。' },
      ko: { label: '韓国語', description: '字幕生成では韓国語を優先します。' }
    },
    topbar: {
      openFiles: 'メディアファイルを開く',
      togglePlaylist: 'プレイリストを切り替え',
      toggleAsr: 'ASR パネルを切り替え',
      toggleInfo: 'メディア情報を表示 / 非表示',
      openSettings: '設定を開く',
      closeSettings: '設定を閉じる'
    },
    emptyState: {
      title: 'AIVPlayer',
      description: '動画をドラッグするか、ローカルメディアを選んで再生を開始します。',
      openVideo: '動画を開く'
    },
    controls: {
      previous: '前へ',
      play: '再生',
      pause: '一時停止',
      next: '次へ',
      stop: '停止',
      stopAndReset: '停止して先頭に戻る',
      mute: 'ミュート',
      fullscreen: '全画面',
      playbackPosition: '再生位置',
      volume: '音量',
      playbackSpeed: '再生速度'
    },
    subtitleDisplay: {
      menuLabel: '字幕表示設定',
      fontSize: 'フォントサイズ',
      fontSizeValue: (value) => `${value}px`,
      decreaseFontSize: '字幕サイズを小さくする',
      increaseFontSize: '字幕サイズを大きくする',
      lineHeight: '行間',
      displayMode: '表示モード',
      translationUnavailable: '翻訳字幕の生成後に翻訳モードを使用できます。',
      reset: '既定に戻す',
      lineHeightOptions: {
        compact: 'コンパクト',
        normal: '標準',
        relaxed: '広め'
      },
      displayModeOptions: {
        source: '原文',
        translation: '翻訳',
        bilingual: '二言語'
      }
    },
    panels: {
      playlistKicker: 'キュー',
      playlistTitle: 'プレイリスト',
      noMedia: 'まだメディアファイルがありません。',
      asrKicker: 'ASR',
      asrTitle: 'ASR パネル',
      subtitlesKicker: '字幕',
      subtitlesTitle: '字幕トラック',
      infoKicker: '情報',
      infoTitle: 'メディア情報',
      currentFile: '現在のファイル',
      containerFormat: 'コンテナ形式',
      fileSize: 'ファイルサイズ',
      duration: '再生時間',
      overallBitrate: '全体ビットレート',
      fullPath: 'フルパス',
      mediaUrl: 'メディア URL',
      videoStream: '映像ストリーム',
      resolution: '解像度',
      frameRate: 'フレームレート',
      videoCodec: '映像コーデック',
      displayAspectRatio: '表示比率',
      audioStream: '音声ストリーム',
      audioCodec: '音声コーデック',
      channels: 'チャンネル',
      sampleRate: 'サンプリングレート',
      audioBitrate: '音声ビットレート',
      playbackState: '再生状態',
      subtitleCache: '字幕キャッシュ',
      noSubtitles: 'まだ字幕トラックは読み込まれていません。',
      subtitleStatusIdle: '待機中',
      subtitleStatusCached: 'キャッシュ準備完了',
      subtitleStatusReady: 'マウント済み',
      loadedToPlayer: 'プレーヤーに読み込み済み',
      vtt: 'VTT',
      srt: 'SRT',
      openAsrPanel: 'ASR パネルを開く',
      asrSubtitleTrack: 'ASR 字幕',
      moreDetails: '詳細を表示'
    },
    mediaDetailsDialog: {
      title: 'メディアの詳細',
      description: 'ffprobe で取得したフォーマットとストリームの詳細を表示します。',
      close: '閉じる',
      sourceLabel: '取得元',
      formatTitle: 'フォーマット情報',
      streamsTitle: 'ストリーム情報',
      noDetails: '表示できる詳細な解析データがありません。'
    },
    asrPanel: {
      engineStatus: 'ASR エンジンの状態',
      refreshEngine: 'ASR エンジンの状態を更新',
      detectingEngine: 'ASR エンジンを確認中...',
      engineReady: 'エンジン準備完了',
      engineNotReady: 'エンジン未準備',
      modelFiles: 'モデルファイル',
      translationLanguagePair: '言語ペア',
      translationTargetLanguage: '翻訳先',
      subtitleLanguage: '認識言語',
      translationModel: '翻訳モデル',
      translationServiceStatus: 'サービス状態',
      translationServiceReady: '利用可能',
      translationServiceNotChecked: '未確認',
      translationServiceUnavailable: '利用不可',
      generateSubtitle: '字幕を生成',
      generatingSubtitle: '生成中',
      translateSubtitle: (languageLabel) => `${languageLabel}に翻訳`,
      translatingSubtitle: '翻訳中',
      translationProgress: (completedBatches, totalBatches) => `第 ${completedBatches} / ${totalBatches} バッチを翻訳中`,
      cancelTranslation: '翻訳をキャンセル',
      translatedSubtitleReady: '翻訳完了',
      subtitleTools: '字幕ツール',
      subtitleToolsMenu: '字幕ツールメニュー',
      openSubtitleFolder: '字幕フォルダを開く',
      openSrtFile: '原文 SRT を開く',
      openTranslatedSrtFile: '訳文 SRT を開く',
      copySrtPath: '原文 SRT のパスをコピー',
      copyTranslatedSrtPath: '訳文 SRT のパスをコピー',
      copyVttPath: '原文 VTT のパスをコピー',
      copyTranslatedVttPath: '訳文 VTT のパスをコピー',
      exportSrt: '原文 SRT を書き出す',
      clipExport: 'クリップを書き出す',
      noModel: '推奨モデルは未インストールです',
      cacheState: '字幕キャッシュ',
      modelSource: 'モデルソース',
      subtitlesReady: 'VTT / SRT / ローカルキャッシュ',
      subtitlesWaiting: '待機中'
    },
    clipExportDialog: {
      title: 'クリップのワンクリック書き出し',
      description: '現在の再生位置から先のクリップを書き出し、最後の選択を記憶します。',
      lengthTitle: 'クリップ長',
      lengthOptions: {
        15: '15 秒',
        30: '30 秒',
        60: '60 秒'
      },
      modeTitle: '書き出し方法',
      modeOptions: {
        video: {
          label: '動画のみ',
          description: '字幕を付けずに動画だけを書き出します。'
        },
        'external-subtitle': {
          label: '外部字幕',
          description: '動画クリップと対応する SRT 字幕を書き出します。'
        },
        'burn-subtitle': {
          label: '字幕を焼き込み',
          description: '字幕を動画に直接焼き込んで書き出します。'
        }
      },
      subtitleRequired: '今は使える字幕がないため、動画のみの書き出ししか選べません。',
      cancel: 'キャンセル',
      export: '書き出す'
    },
    downloadDialog: {
      title: 'ASR モデルのダウンロード元を選択',
      description: (fileName, sizeLabel) =>
        `中国本土のネットワークでは ModelScope をおすすめします。海外、または安定した国際プロキシがある場合は Hugging Face を使ってください。既定のソースは先頭に表示され、既定としてマークされます。どちらも同じ ${fileName} をダウンロードし、サイズは約 ${sizeLabel} です。`,
      close: 'ダウンロード元の選択を閉じる',
      sourceDomestic: 'ModelScope からダウンロード',
      sourceInternational: 'Hugging Face からダウンロード',
      defaultBadge: '既定',
      sourceAria: (sourceName) => `${sourceName} から推奨 ASR モデルをダウンロード`
    },
    settingsDialog: {
      title: '設定',
      description: '設定はすべてローカルに保存され、次回起動時に反映されます。',
      tabs: {
        general: '一般',
        interface: 'インターフェース',
        video: 'ビデオ',
        subtitles: '字幕',
        capture: 'キャプチャと録画',
        shortcuts: 'ショートカット'
      },
      tabAria: {
        general: '一般設定へ移動',
        interface: 'インターフェース設定へ移動',
        video: 'ビデオ設定へ移動',
        subtitles: '字幕設定へ移動',
        capture: 'キャプチャと録画設定へ移動',
        shortcuts: 'ショートカット設定へ移動'
      },
      restoreDefaults: '既定値に戻す',
      openAsrPanel: 'ASR パネルを開く',
      note: 'キャプチャ設定は編集できます。ショートカットのカスタマイズは後日追加します。',
      comingSoon: 'ショートカットのカスタマイズはまだ実装していません。',
      general: {
        title: '一般',
        language: 'インターフェース言語',
        startupPanel: '起動時の既定パネル',
        startupPanelDescription: 'アプリ起動時にこのパネルを直接開きます。',
        defaultFolder: '既定のメディアフォルダ',
        selectFolderDialogTitle: '既定のメディアフォルダを選択',
        selectFolder: 'フォルダを選択',
        clearFolder: 'クリア',
        autoLoadDirectoryFiles: '同じフォルダのメディアを自動読み込み',
        autoLoadDirectoryFilesDescription: '1 本の動画を開いたとき、同じフォルダの兄弟ファイルもプレイリストに追加します。'
      },
      interface: {
        title: 'インターフェース',
        rememberVolume: '音量とミュート状態を記憶',
        rememberVolumeDescription: '次の動画でも最後の音量とミュート状態を使います。',
        rememberPlaybackRate: '再生速度を記憶',
        rememberPlaybackRateDescription: '最後の再生速度を次回起動まで保持します。',
      rememberProgress: '再生位置を記憶',
      rememberProgressDescription: '同じファイルを再度開いたとき、最後に見ていた位置へ戻ります。',
      singleClickPause: '動画を 1 回クリックして一時停止 / 再開',
      singleClickPauseDescription: '動画面をクリックすると再生状態を切り替えます。',
      pauseWhenMinimized: 'ウィンドウ最小化時に自動停止',
      pauseWhenMinimizedDescription: 'ウィンドウが背面に回るか最小化されたら自動で停止します。',
      autoHideControlDeck: '再生コントロールを自動で隠す',
      autoHideControlDeckDescription: '再生中に操作がないとき、下部のコントロールを自動で隠します。',
      autoHideControlDeckDelay: '自動で隠すまでの時間',
      secondsUnit: '秒',
      showTotalPlaybackTime: '残り時間ではなく総時間を表示',
      showTotalPlaybackTimeDescription: '有効にすると、右側の時間表示が残り時間ではなく総時間になります。'
    },
      video: {
        title: 'ビデオ',
        seekStepSeconds: 'シーク間隔',
        seekStepSecondsDescription: '左右キーの既定ジャンプ量です。',
        holdRightArrowSpeed: '右キー長押しで早送り再生',
        holdRightArrowSpeedDescription: '右方向キーを長押しすると、一時的に高速再生へ切り替えます。',
        hardwareAcceleration: 'ハードウェアアクセラレーション',
        hardwareAccelerationDescription: 'このビルドでは既定でブラウザのハードウェアアクセラレーションを使います。'
      },
      subtitles: {
        title: '字幕',
        displayHeading: '字幕表示',
        fontSize: '字幕フォントサイズ',
        fontSizeDescription: '字幕バーに表示する文字サイズの既定値を設定します。',
        lineHeight: '字幕の行間',
        lineHeightDescription: '複数行字幕の縦方向の間隔を設定します。',
        displayMode: '既定の表示モード',
        displayModeDescription: '翻訳が利用可能になったら、原文、翻訳、二言語を切り替えます。',
        targetLanguage: '翻訳先言語',
        targetLanguageDescription: '翻訳字幕の既定の出力言語です。',
        subtitleLanguage: '既定の字幕言語',
        subtitleLanguageDescription: '字幕生成ではこの言語を優先するか、自動判定のままにします。',
        autoLoadCachedSubtitles: 'ローカル字幕キャッシュを自動読み込み',
        autoLoadCachedSubtitlesDescription: '同じ動画を再度開いたときに、キャッシュ済みの VTT / SRT を復元します。',
        modelSource: '既定の ASR モデルソース',
        modelSourceDescription: 'ダウンロードダイアログでは、このソースが先頭に表示されます。',
        translationServiceTitle: '翻訳サービス',
        translationServiceDescription:
          'OpenAI互換の Chat Completions エンドポイントを設定すると、字幕をそのまま翻訳できます。API key はシステムの安全な保存先で暗号化して保存します。',
        translationBaseUrl: '翻訳エンドポイント',
        translationBaseUrlDescription: 'Chat Completions の完全なエンドポイントを入力してください。例: /v1/chat/completions。',
        translationModel: '翻訳モデル',
        translationModelDescription: '翻訳に使うモデル名を入力してください。例: mimo-v2.5。',
        translationApiKey: 'API key',
        translationApiKeyDescription: 'API key はローカルに暗号化して保存され、通常の設定ファイルへ平文で書き込まれません。',
        translationGlossary: '用語集',
        translationGlossaryDescription: '1 行に 1 つ、source=target の形式で固定訳を入力します。例: Technology=技術。',
        translationServiceCheckTitle: '翻訳サービス確認',
        translationServiceCheckDescription:
          '現在のエンドポイントにサンプル字幕を送り、モデルと API key が解析可能な結果を返せるか確認します。',
        translationServiceCheck: '翻訳サービスをテスト',
        translationServiceChecking: 'テスト中',
        translationServiceResultTitle: 'テスト結果',
        translationServicePreviewTitle: 'プレビュー結果'
      },
      capture: {
        title: 'キャプチャと録画',
        description: 'キャプチャ / 録画パイプラインが来たときに使う既定の保存先や GIF 設定を先に決めておけます。',
        saveFolder: '保存フォルダ',
        saveFolderDescription: 'キャプチャした画像や録画はこのフォルダを既定で使います。',
        selectFolderDialogTitle: 'キャプチャと録画の保存フォルダを選択',
        selectFolder: 'フォルダを選択',
        copyToClipboard: 'クリップボードにもコピー',
        copyToClipboardDescription: '保存後に画像をすぐクリップボードへコピーします。',
        imageFormat: '画像形式',
        imageFormatDescription: 'スクリーンショットの既定ファイル形式です。',
        fileNaming: 'ファイル名',
        fileNamingDescription: 'スクリーンショットの既定の命名方法です。',
        gifFrameRate: 'GIF のフレームレート',
        gifFrameRateDescription: 'GIF 書き出し時に 1 秒あたり何フレーム残すかを決めます。',
        gifResolution: 'GIF の解像度',
        gifResolutionDescription: 'GIF 書き出し時の既定解像度です。',
        formats: {
          jpg: 'JPG',
          png: 'PNG'
        },
        namingOptions: {
          sequential: '順番',
          timestamp: 'タイムスタンプ'
        },
        resolutionOptions: {
          '360p': '360p',
          '480p': '480p',
          '720p': '720p'
        }
      },
      shortcuts: {
        title: 'ショートカット',
        description: 'ショートカットのカスタマイズはまだ実装していません。'
      }
    },
    modelView: {
      missing: (name, ramRequirement) => `推奨モデルは ${name}、${ramRequirement} です。`,
      downloading: (sourceName) => `推奨モデルを ${sourceName} からダウンロードしています。`,
      installedNeedsWhisper: 'モデルファイルはありますが、whisper.cpp がまだありません。',
      installedNeedsFfmpeg: 'モデルファイルはありますが、ffmpeg がまだありません。',
      installedReady: 'モデルファイルはローカル字幕生成に使えます。',
      missingLabel: 'モデル未インストール',
      downloadingLabel: 'モデルをダウンロード中',
      installedLabel: 'モデルインストール済み',
      downloadRecommended: '推奨モデルをダウンロード',
      redownload: '再ダウンロード / ソース変更'
    },
    messages: {
      noSubtitleFolder: '字幕フォルダを開けませんでした。ファイルがまだ存在するか確認してください。',
      noSrtFile: 'SRT ファイルを開けませんでした。既定アプリかファイルの存在を確認してください。',
      noCopyContent: 'コピーする内容がありません。',
      copied: 'クリップボードにコピーしました。'
    },
    runtime: {
      asrEngineMissing:
        '内蔵 ASR コンポーネントが見つかりません。正式版には whisper.cpp が同梱されているはずです。開発中は whisper.cpp CLI を手動選択するか、resources/whisper.cpp に配置してください。',
      ffmpegMissing:
        '内蔵 ffmpeg が見つかりません。正式版には ffmpeg が同梱されているはずです。開発中は resources/ffmpeg に配置してください。',
      detectedWhisper: (version) => (version ? `whisper.cpp を検出しました: ${version}` : 'whisper.cpp を検出しました'),
      detectedWhisperWithoutModels: (modelFileName) =>
        `whisper.cpp と ffmpeg は見つかりましたが、モデルがまだありません。${modelFileName} をダウンロードしてください。`,
      modelDownloaded: (modelName) => `モデルの準備ができました: ${modelName}`,
      needModel: (recommendedModel) => `使用可能な ASR モデルがまだありません。${recommendedModel} をダウンロードしてください。`,
      playbackStartFailed: (detail) => `プレーヤーの起動に失敗しました: ${detail}`,
      mediaReadFailed: (detail) => `メディアの読み込みに失敗しました: ${detail}`,
      videoDecodeFailed: (detail) => `動画のデコードに失敗しました: ${detail}`,
      mediaSourceNotSupported: (detail) => `メディアソースを読み取れないか、対応していません: ${detail}`,
      playbackFailed: (detail) => `再生に失敗しました: ${detail}`,
      mediaReadFallback: '読み込み中にネットワークまたはファイルシステムのエラーが発生しました。',
      videoDecodeFallback: '現在の Electron / Chromium デコーダーではこのファイルをこれ以上デコードできません。',
      mediaSourceNotSupportedFallback: 'ファイルパス、コンテナ形式、コーデックを確認してください。',
      unknownMediaError: (code) => `不明なメディアエラー ${code}。`,
      subtitleGenerated: '字幕の生成が完了しました。VTT はマウント済みで、SRT は書き出し済みです。',
      subtitleCacheMiss: 'ローカル字幕キャッシュが見つかりませんでした。',
      subtitleCacheHit: 'ローカル字幕キャッシュにヒットしました（VTT / SRT）。',
      subtitleExported: 'VTT から SRT を書き出しました。',
      subtitleTranslated: '字幕の翻訳が完了しました。翻訳 VTT はマウント済みで、SRT は書き出し済みです。',
      subtitleTranslationCanceled: '字幕の翻訳をキャンセルしました。新しい翻訳キャッシュは作成されていません。',
      translationServiceMissing:
        '翻訳サービスが設定されていません。設定画面でエンドポイント、モデル、API key を入力するか、AIVPLAYER_TRANSLATION_BASE_URL、AIVPLAYER_TRANSLATION_API_KEY、AIVPLAYER_TRANSLATION_MODEL を設定してください。',
      translationServiceReady: (model) => `翻訳サービスは利用できます。${model} が有効な結果を返しました。`,
      translationServiceNetworkError: '翻訳サービスへのネットワークリクエストに失敗しました。',
      translationServiceHttpError: (status, statusText) =>
        `翻訳エンドポイントが HTTP ${status}${statusText ? ` ${statusText}` : ''} を返しました。`,
      translationServiceInvalidJson: '翻訳エンドポイントの JSON を解析できませんでした。',
      translationServiceInvalidResponse: '翻訳エンドポイントが無効な応答内容を返しました。',
      translationServiceEmptyResponse: '翻訳エンドポイントが空の結果を返しました。',
      clipExportSuccess: 'クリップの書き出しが完了しました。',
      clipExportWithSubtitleSuccess: 'クリップと外部字幕の書き出しが完了しました。',
      clipExportBurnedSuccess: '字幕を焼き込んだクリップの書き出しが完了しました。',
      clipExportFailed: 'クリップの書き出しに失敗しました',
      clipExportSubtitleMissing: '使える字幕がないため、字幕付きクリップを書き出せません。',
      modelAlreadyCached: 'モデルはすでにローカルに存在します。',
      modelDownloadStart: (sourceName) => `${sourceName} から ASR モデルのダウンロードを開始します。`,
      modelDownloading: 'モデルをダウンロード中。',
      modelDownloadComplete: 'モデルのダウンロードが完了しました。',
      preparingSubtitleCache: '音声と字幕キャッシュを準備しています。',
      extractingAudio: 'ffmpeg で 16k モノラル音声を抽出しています。',
      transcribing: 'whisper.cpp で音声を認識し、VTT / SRT 字幕を生成しています。',
      asrGpuFallback: 'GPU を利用できないため、CPU に切り替えて認識を続けます。',
      noSubtitleFiles: 'whisper.cpp は終了しましたが、期待された VTT / SRT ファイルが生成されませんでした。',
      openMpvMissing: 'mpv が見つかりません。mpv をインストールするか、AIVPLAYER_MPV_BIN で mpv 実行ファイルを指定してください。',
      openMpvDetected: (versionOrPath) => `mpv を検出しました: ${versionOrPath}`,
      stopNativePlayer: 'このビルドでは外部 mpv 再生プロセスは使っていません。'
    },
    runtimeDialog: {
      autoDetectTitle: 'whisper.cpp を自動検出',
      autoDetectMessage:
        'ASR エンジンの自動検出が完了しました。正式版でコンポーネントが不足している場合は AIVPlayer を再インストールしてください。開発中は whisper.cpp 実行ファイルを手動選択することもできます。',
      autoDetectSuccess: (path) => `ASR エンジンを自動検出しました: ${path}`,
      selectWhisperTitle: 'whisper.cpp 実行ファイルを選択',
      selectWhisperMessage: 'whisper.cpp がビルドした実行ファイルを選択してください。',
      selectWhisperCancel: 'ASR エンジンの選択をキャンセルしました。',
      selectWhisperSuccess: (path) => `ASR エンジンを選択しました: ${path}`,
      selectWhisperCompatSuccess: (path) => `ASR エンジンを選択しました: ${path}（互換版に自動切り替えました）`,
      selectWhisperFailed: '選択したファイルは ASR エンジンとして使えません。',
      clipExportSaveTitle: 'クリップの保存先を選択',
      clipExportSaveConfirm: '書き出す'
    },
    asrModelStatus: {
      missing: 'モデル未インストール',
      downloading: 'モデルをダウンロード中',
      installedNeedsRuntime: 'モデルインストール済み',
      installedReady: 'モデルインストール済み',
      progressLabel: '処理中'
    },
    modelSources: {
      modelscope: {
        title: 'ModelScope',
        description: '中国本土のネットワークに向いており、通常は追加プロキシなしで使えます。',
        hint: '中国本土向け推奨',
        region: '中国本土'
      },
      huggingface: {
        title: 'Hugging Face',
        description: '海外ネットワーク、または安定した国際プロキシがある環境に向いています。',
        hint: '海外ネットワーク向け推奨',
        region: '国際'
      }
    },
    probeFieldLabels: {
      'filename': 'ファイル名',
      'nb_streams': 'ストリーム数',
      'nb_programs': 'プログラム数',
      'nb_stream_groups': 'ストリームグループ数',
      'format_name': 'フォーマット名',
      'format_long_name': 'フォーマット正式名称',
      'start_time': '開始時間',
      'duration': '再生時間',
      'duration_ts': '再生時間 TS',
      'size': 'サイズ',
      'bit_rate': 'ビットレート',
      'probe_score': 'プローブスコア',
      'tags.major_brand': 'メジャーブランド',
      'tags.minor_version': 'マイナーバージョン',
      'tags.compatible_brands': '互換ブランド',
      'tags.encoder': 'エンコーダー',
      'tags.comment': 'コメント',
      'tags.language': '言語',
      'tags.handler_name': 'ハンドラ名',
      'codec_name': 'コーデック名',
      'codec_long_name': 'コーデック正式名称',
      'codec_type': 'コーデックタイプ',
      'codec_tag': 'コーデックタグ',
      'codec_tag_string': 'コーデックタグ文字列',
      'profile': 'プロファイル',
      'width': '幅',
      'height': '高さ',
      'coded_width': 'エンコード幅',
      'coded_height': 'エンコード高さ',
      'closed_captions': 'クローズドキャプション',
      'film_grain': 'フィルムグレイン',
      'has_b_frames': 'B フレーム',
      'sample_aspect_ratio': 'サンプルアスペクト比',
      'display_aspect_ratio': 'ディスプレイアスペクト比',
      'pix_fmt': 'ピクセルフォーマット',
      'level': 'レベル',
      'color_range': 'カラー範囲',
      'color_space': 'カラースペース',
      'color_transfer': 'カラートランスファー',
      'color_primaries': 'カラープライマリー',
      'chroma_location': 'クロマロケーション',
      'field_order': 'フィールドオーダー',
      'refs': 'リファレンス',
      'r_frame_rate': 'フレームレート',
      'avg_frame_rate': '平均フレームレート',
      'time_base': 'タイムベース',
      'start_pts': '開始 PTS',
      'start_time.2': '開始時間',
      'extradata_size': '追加データサイズ',
      'disposition.default': 'デフォルト',
      'disposition.dub': 'ダブ',
      'disposition.original': 'オリジナル',
      'disposition.comment': 'コメント',
      'disposition.lyrics': '歌詞',
      'disposition.karaoke': 'カラオケ',
      'disposition.forced': '強制',
      'disposition.hearing_impaired': '聴覚障害',
      'disposition.visual_impaired': '視覚障害',
      'disposition.clean_effects': 'クリーンエフェクト',
      'disposition.attached_pic': '添付画像',
      'disposition.timed_thumbnails': 'タイミングサムネイル',
      'disposition.non_diegetic': 'ノンダイジェティック',
      'disposition.captions': 'キャプション',
      'disposition.descriptions': '説明',
      'disposition.metadata': 'メタデータ',
      'disposition.dependent': '依存',
      'disposition.still_image': '静止画',
      'disposition.multilayer': 'マルチレイヤー',
      'channel_layout': 'チャネルレイアウト',
      'channels': 'チャンネル数',
      'bits_per_sample': 'サンプルビット数',
      'sample_fmt': 'サンプルフォーマット',
      'sample_rate': 'サンプリングレート'
    }
  },
  'ko-KR': {
    appName: 'AIVPlayer',
    languageOptions: {
      'zh-CN': { label: '简体中文', description: '인터페이스와 안내를 간체 중국어로 표시합니다.' },
      'en-US': { label: 'English', description: '인터페이스와 안내를 영어로 표시합니다.' },
      'ja-JP': { label: '日本語', description: '인터페이스와 안내를 일본어로 표시합니다.' },
      'ko-KR': { label: '한국어', description: '인터페이스와 안내를 한국어로 표시합니다.' }
    },
    subtitleLanguageOptions: {
      auto: { label: '자동', description: 'whisper.cpp가 음성 언어를 자동으로 판별하게 합니다.' },
      zh: { label: '중국어', description: '자막 생성 시 중국어를 우선합니다.' },
      en: { label: '영어', description: '자막 생성 시 영어를 우선합니다.' },
      ja: { label: '일본어', description: '자막 생성 시 일본어를 우선합니다.' },
      ko: { label: '한국어', description: '자막 생성 시 한국어를 우선합니다.' }
    },
    topbar: {
      openFiles: '미디어 파일 열기',
      togglePlaylist: '재생 목록 전환',
      toggleAsr: 'ASR 패널 전환',
      toggleInfo: '미디어 정보 표시 / 숨기기',
      openSettings: '설정 열기',
      closeSettings: '설정 닫기'
    },
    emptyState: {
      title: 'AIVPlayer',
      description: '동영상을 끌어다 놓거나 로컬 미디어를 선택해서 재생을 시작하세요.',
      openVideo: '비디오 열기'
    },
    controls: {
      previous: '이전',
      play: '재생',
      pause: '일시 정지',
      next: '다음',
      stop: '정지',
      stopAndReset: '정지하고 처음으로 이동',
      mute: '음소거',
      fullscreen: '전체 화면',
      playbackPosition: '재생 위치',
      volume: '볼륨',
      playbackSpeed: '재생 속도'
    },
    subtitleDisplay: {
      menuLabel: '자막 표시 설정',
      fontSize: '글자 크기',
      fontSizeValue: (value) => `${value}px`,
      decreaseFontSize: '자막 글자 크기 줄이기',
      increaseFontSize: '자막 글자 크기 키우기',
      lineHeight: '줄 높이',
      displayMode: '표시 모드',
      translationUnavailable: '번역 자막을 생성한 뒤 번역 모드를 사용할 수 있습니다.',
      reset: '기본값으로',
      lineHeightOptions: {
        compact: '촘촘하게',
        normal: '표준',
        relaxed: '넓게'
      },
      displayModeOptions: {
        source: '원문',
        translation: '번역',
        bilingual: '이중 언어'
      }
    },
    panels: {
      playlistKicker: '대기열',
      playlistTitle: '재생 목록',
      noMedia: '아직 미디어 파일이 없습니다.',
      asrKicker: 'ASR',
      asrTitle: 'ASR 패널',
      subtitlesKicker: '자막',
      subtitlesTitle: '자막 트랙',
      infoKicker: '정보',
      infoTitle: '미디어 정보',
      currentFile: '현재 파일',
      containerFormat: '컨테이너 형식',
      fileSize: '파일 크기',
      duration: '길이',
      overallBitrate: '전체 비트레이트',
      fullPath: '전체 경로',
      mediaUrl: '미디어 URL',
      videoStream: '비디오 스트림',
      resolution: '해상도',
      frameRate: '프레임레이트',
      videoCodec: '비디오 코덱',
      displayAspectRatio: '화면 비율',
      audioStream: '오디오 스트림',
      audioCodec: '오디오 코덱',
      channels: '채널',
      sampleRate: '샘플레이트',
      audioBitrate: '오디오 비트레이트',
      playbackState: '재생 상태',
      subtitleCache: '자막 캐시',
      noSubtitles: '아직 자막 트랙이 로드되지 않았습니다.',
      subtitleStatusIdle: '대기',
      subtitleStatusCached: '캐시 준비됨',
      subtitleStatusReady: '마운트됨',
      loadedToPlayer: '플레이어에 로드됨',
      vtt: 'VTT',
      srt: 'SRT',
      openAsrPanel: 'ASR 패널 열기',
      asrSubtitleTrack: 'ASR 자막',
      moreDetails: '자세한 정보'
    },
    mediaDetailsDialog: {
      title: '전체 미디어 정보',
      description: 'ffprobe로 추출한 포맷과 스트림의 모든 필드를 확인합니다.',
      close: '닫기',
      sourceLabel: '탐지 도구',
      formatTitle: '포맷 정보',
      streamsTitle: '스트림 정보',
      noDetails: '표시할 자세한 탐지 데이터가 없습니다.'
    },
    asrPanel: {
      engineStatus: 'ASR 엔진 상태',
      refreshEngine: 'ASR 엔진 상태 새로고침',
      detectingEngine: 'ASR 엔진을 확인 중...',
      engineReady: '엔진 준비 완료',
      engineNotReady: '엔진 준비 안 됨',
      modelFiles: '모델 파일',
      translationLanguagePair: '언어 쌍',
      translationTargetLanguage: '번역 대상',
      subtitleLanguage: '감지 언어',
      translationModel: '번역 모델',
      translationServiceStatus: '서비스 상태',
      translationServiceReady: '사용 가능',
      translationServiceNotChecked: '확인 안 됨',
      translationServiceUnavailable: '사용 불가',
      generateSubtitle: '자막 생성',
      generatingSubtitle: '생성 중',
      translateSubtitle: (languageLabel) => `${languageLabel}(으)로 번역`,
      translatingSubtitle: '번역 중',
      translationProgress: (completedBatches, totalBatches) => `${completedBatches} / ${totalBatches} 배치를 번역하는 중`,
      cancelTranslation: '번역 취소',
      translatedSubtitleReady: '번역 완료',
      subtitleTools: '자막 도구',
      subtitleToolsMenu: '자막 도구 메뉴',
      openSubtitleFolder: '자막 폴더 열기',
      openSrtFile: '원문 SRT 파일 열기',
      openTranslatedSrtFile: '번역 SRT 파일 열기',
      copySrtPath: '원문 SRT 경로 복사',
      copyTranslatedSrtPath: '번역 SRT 경로 복사',
      copyVttPath: '원문 VTT 경로 복사',
      copyTranslatedVttPath: '번역 VTT 경로 복사',
      exportSrt: '원문 SRT 내보내기',
      clipExport: '클립 내보내기',
      noModel: '추천 모델이 설치되지 않았습니다',
      cacheState: '자막 캐시',
      modelSource: '모델 소스',
      subtitlesReady: 'VTT / SRT / 로컬 캐시',
      subtitlesWaiting: '대기 중'
    },
    clipExportDialog: {
      title: '원클릭 클립 내보내기',
      description: '현재 재생 위치부터 이어지는 클립을 내보내고, 마지막 선택을 기억합니다.',
      lengthTitle: '클립 길이',
      lengthOptions: {
        15: '15초',
        30: '30초',
        60: '60초'
      },
      modeTitle: '내보내기 방식',
      modeOptions: {
        video: {
          label: '비디오만',
          description: '자막 없이 영상 클립만 내보냅니다.'
        },
        'external-subtitle': {
          label: '외부 자막',
          description: '영상 클립과 같은 이름의 SRT 자막 파일을 함께 내보냅니다.'
        },
        'burn-subtitle': {
          label: '자막 굽기',
          description: '자막을 영상에 직접 굽어서 내보냅니다.'
        }
      },
      subtitleRequired: '현재 사용할 수 있는 자막이 없어서 비디오만 내보낼 수 있습니다.',
      cancel: '취소',
      export: '내보내기'
    },
    downloadDialog: {
      title: 'ASR 모델 다운로드 소스 선택',
      description: (fileName, sizeLabel) =>
        `중국 본토 네트워크에서는 ModelScope를 추천합니다. 해외이거나 안정적인 국제 프록시가 있으면 Hugging Face를 사용하세요. 기본 소스는 먼저 표시되고 기본으로 표시됩니다. 두 소스는 같은 ${fileName}을 다운로드하며, 크기는 약 ${sizeLabel}입니다.`,
      close: '다운로드 소스 선택 닫기',
      sourceDomestic: 'ModelScope에서 다운로드',
      sourceInternational: 'Hugging Face에서 다운로드',
      defaultBadge: '기본',
      sourceAria: (sourceName) => `${sourceName}에서 추천 ASR 모델 다운로드`
    },
    settingsDialog: {
      title: '설정',
      description: '설정은 모두 로컬에 저장되며 다음 실행 시 적용됩니다.',
      tabs: {
        general: '일반',
        interface: '인터페이스',
        video: '비디오',
        subtitles: '자막',
        capture: '캡처 및 녹화',
        shortcuts: '단축키'
      },
      tabAria: {
        general: '일반 설정으로 이동',
        interface: '인터페이스 설정으로 이동',
        video: '비디오 설정으로 이동',
        subtitles: '자막 설정으로 이동',
        capture: '캡처 및 녹화 설정으로 이동',
        shortcuts: '단축키 설정으로 이동'
      },
      restoreDefaults: '기본값 복원',
      openAsrPanel: 'ASR 패널 열기',
      note: '캡처 및 녹화 설정은 이제 수정할 수 있고, 단축키 사용자 지정은 나중에 추가됩니다.',
      comingSoon: '단축키 사용자 지정은 아직 구현되지 않았습니다.',
      general: {
        title: '일반',
        language: '인터페이스 언어',
        startupPanel: '시작 시 기본 패널',
        startupPanelDescription: '앱 시작 시 이 패널을 바로 엽니다.',
        defaultFolder: '기본 미디어 폴더',
        selectFolderDialogTitle: '기본 미디어 폴더 선택',
        selectFolder: '폴더 선택',
        clearFolder: '지우기',
        autoLoadDirectoryFiles: '같은 폴더의 미디어 파일 자동 로드',
        autoLoadDirectoryFilesDescription: '하나의 비디오를 열면 같은 폴더의 형제 파일도 재생 목록에 추가합니다.'
      },
      interface: {
        title: '인터페이스',
        rememberVolume: '볼륨과 음소거 상태 기억',
        rememberVolumeDescription: '다음 비디오를 열 때 마지막 볼륨과 음소거 상태를 사용합니다.',
        rememberPlaybackRate: '재생 속도 기억',
        rememberPlaybackRateDescription: '마지막 재생 속도를 다음 실행까지 유지합니다.',
      rememberProgress: '재생 진행률 기억',
      rememberProgressDescription: '같은 파일을 다시 열면 마지막에 보던 위치로 돌아갑니다.',
      singleClickPause: '영상 한 번 클릭으로 일시 정지 / 재개',
      singleClickPauseDescription: '영상 표면을 클릭하면 재생 상태를 전환합니다.',
      pauseWhenMinimized: '창 최소화 시 자동 일시 정지',
      pauseWhenMinimizedDescription: '창이 뒤로 가거나 최소화되면 자동으로 멈춥니다.',
      autoHideControlDeck: '재생 컨트롤 자동 숨기기',
      autoHideControlDeckDescription: '재생 중에 조작이 없으면 하단 컨트롤을 자동으로 숨깁니다.',
      autoHideControlDeckDelay: '자동 숨김 지연',
      secondsUnit: '초',
      showTotalPlaybackTime: '남은 시간 대신 총 시간 표시',
      showTotalPlaybackTimeDescription: '이 옵션을 켜면 오른쪽 시간에 남은 시간 대신 전체 길이가 표시됩니다.'
    },
      video: {
        title: '비디오',
        seekStepSeconds: '탐색 간격',
        seekStepSecondsDescription: '좌우 방향키의 기본 점프 거리입니다.',
        holdRightArrowSpeed: '오른쪽 화살표 길게 눌러 고속 재생',
        holdRightArrowSpeedDescription: '오른쪽 방향키를 길게 누르면 잠시 더 높은 속도로 전환합니다.',
        hardwareAcceleration: '하드웨어 가속',
        hardwareAccelerationDescription: '이 빌드는 기본적으로 브라우저 하드웨어 가속을 사용합니다.'
      },
      subtitles: {
        title: '자막',
        displayHeading: '자막 표시',
        fontSize: '자막 글자 크기',
        fontSizeDescription: '자막 바에 표시되는 기본 글자 크기를 조정합니다.',
        lineHeight: '자막 줄 높이',
        lineHeightDescription: '여러 줄 자막의 세로 간격을 조정합니다.',
        displayMode: '기본 표시 모드',
        displayModeDescription: '번역을 사용할 수 있을 때 원문, 번역, 이중 언어 모드를 전환합니다.',
        targetLanguage: '번역 대상 언어',
        targetLanguageDescription: '번역 자막의 기본 출력 언어입니다.',
        subtitleLanguage: '기본 자막 언어',
        subtitleLanguageDescription: '자막 생성 시 이 언어를 우선하거나 자동 감지를 유지합니다.',
        autoLoadCachedSubtitles: '로컬 자막 캐시 자동 로드',
        autoLoadCachedSubtitlesDescription: '같은 비디오를 다시 열면 캐시된 VTT / SRT를 복원합니다.',
        modelSource: '기본 ASR 모델 소스',
        modelSourceDescription: '다운로드 대화상자에서 이 소스를 먼저 표시합니다.',
        translationServiceTitle: '번역 서비스',
        translationServiceDescription:
          'OpenAI 호환 Chat Completions 엔드포인트를 입력하면 자막을 바로 목표 언어로 번역할 수 있습니다. API key는 시스템 보안 저장소를 사용해 로컬에 암호화해서 저장합니다.',
        translationBaseUrl: '번역 엔드포인트',
        translationBaseUrlDescription: 'Chat Completions의 전체 엔드포인트를 입력하세요. 예: /v1/chat/completions.',
        translationModel: '번역 모델',
        translationModelDescription: '번역에 사용할 모델 이름을 입력하세요. 예: mimo-v2.5.',
        translationApiKey: 'API key',
        translationApiKeyDescription: 'API key는 로컬에 암호화되어 저장되며 일반 설정 파일에 평문으로 기록되지 않습니다.',
        translationGlossary: '용어집',
        translationGlossaryDescription: '한 줄에 하나씩 source=target 형식으로 고정 번역을 입력하세요. 예: Technology=기술.',
        translationServiceCheckTitle: '번역 서비스 확인',
        translationServiceCheckDescription:
          '현재 엔드포인트에 샘플 자막을 보내 모델과 API key가 파싱 가능한 결과를 반환하는지 확인합니다.',
        translationServiceCheck: '번역 서비스 테스트',
        translationServiceChecking: '테스트 중',
        translationServiceResultTitle: '테스트 결과',
        translationServicePreviewTitle: '미리보기 결과'
      },
      capture: {
        title: '캡처 및 녹화',
        description: '향후 캡처 / 녹화 파이프라인이 사용할 기본 저장 위치와 GIF 옵션을 미리 정해둘 수 있습니다.',
        saveFolder: '저장 폴더',
        saveFolderDescription: '캡처한 이미지와 녹화 파일은 기본적으로 이 폴더를 사용합니다.',
        selectFolderDialogTitle: '캡처 및 녹화 저장 폴더 선택',
        selectFolder: '폴더 선택',
        copyToClipboard: '클립보드에도 복사',
        copyToClipboardDescription: '저장한 스크린샷을 바로 클립보드에 복사합니다.',
        imageFormat: '이미지 형식',
        imageFormatDescription: '스크린샷의 기본 파일 형식입니다.',
        fileNaming: '파일 이름',
        fileNamingDescription: '스크린샷의 기본 명명 방식입니다.',
        gifFrameRate: 'GIF 프레임레이트',
        gifFrameRateDescription: 'GIF 내보내기 시 초당 몇 프레임을 유지할지 정합니다.',
        gifResolution: 'GIF 해상도',
        gifResolutionDescription: 'GIF 내보내기 시 사용할 기본 해상도입니다.',
        formats: {
          jpg: 'JPG',
          png: 'PNG'
        },
        namingOptions: {
          sequential: '순서',
          timestamp: '타임스탬프'
        },
        resolutionOptions: {
          '360p': '360p',
          '480p': '480p',
          '720p': '720p'
        }
      },
      shortcuts: {
        title: '단축키',
        description: '단축키 사용자 지정은 아직 구현하지 않았습니다.'
      }
    },
    modelView: {
      missing: (name, ramRequirement) => `추천 모델: ${name}, ${ramRequirement}.`,
      downloading: (sourceName) => `${sourceName}에서 추천 모델을 다운로드하는 중입니다.`,
      installedNeedsWhisper: '모델 파일은 준비됐지만 whisper.cpp가 아직 없습니다.',
      installedNeedsFfmpeg: '모델 파일은 준비됐지만 ffmpeg가 아직 없습니다.',
      installedReady: '모델 파일이 로컬 자막 생성에 사용할 준비가 됐습니다.',
      missingLabel: '모델 미설치',
      downloadingLabel: '모델 다운로드 중',
      installedLabel: '모델 설치됨',
      downloadRecommended: '추천 모델 다운로드',
      redownload: '다시 다운로드 / 소스 변경'
    },
    messages: {
      noSubtitleFolder: '자막 폴더를 열 수 없습니다. 파일이 아직 존재하는지 확인하세요.',
      noSrtFile: 'SRT 파일을 열 수 없습니다. 기본 앱이나 파일 존재 여부를 확인하세요.',
      noCopyContent: '복사할 내용이 없습니다.',
      copied: '클립보드에 복사했습니다.'
    },
    runtime: {
      asrEngineMissing:
        '내장 ASR 구성 요소를 찾지 못했습니다. 정식 빌드에는 whisper.cpp가 포함되어 있어야 합니다. 개발 중에는 whisper.cpp CLI를 수동으로 선택하거나 resources/whisper.cpp에 넣으세요.',
      ffmpegMissing:
        '내장 ffmpeg를 찾지 못했습니다. 정식 빌드에는 ffmpeg가 포함되어 있어야 합니다. 개발 중에는 resources/ffmpeg에 넣으세요.',
      detectedWhisper: (version) => (version ? `whisper.cpp를 감지했습니다: ${version}` : 'whisper.cpp를 감지했습니다'),
      detectedWhisperWithoutModels: (modelFileName) =>
        `whisper.cpp와 ffmpeg는 감지됐지만 아직 모델이 없습니다. ${modelFileName}을 다운로드하세요.`,
      modelDownloaded: (modelName) => `모델 준비 완료: ${modelName}`,
      needModel: (recommendedModel) => `사용 가능한 ASR 모델이 없습니다. ${recommendedModel}을 다운로드하세요.`,
      playbackStartFailed: (detail) => `플레이어 시작에 실패했습니다: ${detail}`,
      mediaReadFailed: (detail) => `미디어 읽기에 실패했습니다: ${detail}`,
      videoDecodeFailed: (detail) => `비디오 디코딩에 실패했습니다: ${detail}`,
      mediaSourceNotSupported: (detail) => `미디어 소스를 읽을 수 없거나 지원하지 않습니다: ${detail}`,
      playbackFailed: (detail) => `재생에 실패했습니다: ${detail}`,
      mediaReadFallback: '파일을 읽는 동안 네트워크 또는 파일 시스템 오류가 발생했습니다.',
      videoDecodeFallback: '현재 Electron / Chromium 디코더가 이 파일의 디코딩을 계속할 수 없습니다.',
      mediaSourceNotSupportedFallback: '파일 경로, 컨테이너 형식, 코덱을 확인해 주세요.',
      unknownMediaError: (code) => `알 수 없는 미디어 오류 ${code}.`,
      subtitleGenerated: '자막 생성이 완료되었습니다. VTT는 마운트됐고 SRT는 내보냈습니다.',
      subtitleCacheMiss: '로컬 자막 캐시를 찾지 못했습니다.',
      subtitleCacheHit: '로컬 자막 캐시가 있습니다(VTT / SRT).',
      subtitleExported: 'VTT에서 SRT를 내보냈습니다.',
      subtitleTranslated: '자막 번역이 완료되었습니다. 번역 VTT는 마운트됐고 SRT는 내보냈습니다.',
      subtitleTranslationCanceled: '자막 번역을 취소했습니다. 새 번역 캐시는 생성되지 않았습니다.',
      translationServiceMissing:
        '번역 서비스가 설정되지 않았습니다. 설정에서 엔드포인트, 모델, API key를 입력하거나 AIVPLAYER_TRANSLATION_BASE_URL, AIVPLAYER_TRANSLATION_API_KEY, AIVPLAYER_TRANSLATION_MODEL을 설정하세요.',
      translationServiceReady: (model) => `번역 서비스를 사용할 수 있습니다. ${model}이 유효한 결과를 반환했습니다.`,
      translationServiceNetworkError: '번역 서비스 네트워크 요청에 실패했습니다.',
      translationServiceHttpError: (status, statusText) =>
        `번역 엔드포인트가 HTTP ${status}${statusText ? ` ${statusText}` : ''}를 반환했습니다.`,
      translationServiceInvalidJson: '번역 엔드포인트의 JSON을 해석할 수 없습니다.',
      translationServiceInvalidResponse: '번역 엔드포인트가 잘못된 응답 내용을 반환했습니다.',
      translationServiceEmptyResponse: '번역 엔드포인트가 빈 결과를 반환했습니다.',
      clipExportSuccess: '클립 내보내기가 완료되었습니다.',
      clipExportWithSubtitleSuccess: '클립과 외부 자막 내보내기가 완료되었습니다.',
      clipExportBurnedSuccess: '자막을 굽은 클립 내보내기가 완료되었습니다.',
      clipExportFailed: '클립 내보내기에 실패했습니다',
      clipExportSubtitleMissing: '사용할 수 있는 자막이 없어서 자막 포함 클립을 내보낼 수 없습니다.',
      modelAlreadyCached: '모델이 이미 로컬에 있습니다.',
      modelDownloadStart: (sourceName) => `${sourceName}에서 ASR 모델 다운로드를 시작합니다.`,
      modelDownloading: '모델 다운로드 중.',
      modelDownloadComplete: '모델 다운로드 완료.',
      preparingSubtitleCache: '오디오와 자막 캐시를 준비하는 중입니다.',
      extractingAudio: 'ffmpeg로 16k 모노 오디오를 추출하는 중입니다.',
      transcribing: 'whisper.cpp로 음성을 인식해 VTT / SRT 자막을 만드는 중입니다.',
      asrGpuFallback: 'GPU 가속을 사용할 수 없어 CPU로 전환해 인식을 계속합니다.',
      noSubtitleFiles: 'whisper.cpp가 종료됐지만 기대한 VTT / SRT 파일이 생성되지 않았습니다.',
      openMpvMissing: 'mpv를 찾지 못했습니다. mpv를 설치하거나 AIVPLAYER_MPV_BIN으로 mpv 실행 파일을 지정하세요.',
      openMpvDetected: (versionOrPath) => `mpv를 감지했습니다: ${versionOrPath}`,
      stopNativePlayer: '이 빌드는 외부 mpv 재생 프로세스를 사용하지 않습니다.'
    },
    runtimeDialog: {
      autoDetectTitle: 'whisper.cpp 자동 감지',
      autoDetectMessage:
        'ASR 엔진 자동 감지가 완료되었습니다. 정식 빌드에 구성 요소가 부족하면 AIVPlayer를 다시 설치하세요. 개발 중에는 whisper.cpp 실행 파일을 수동으로 선택할 수도 있습니다.',
      autoDetectSuccess: (path) => `ASR 엔진을 자동 감지했습니다: ${path}`,
      selectWhisperTitle: 'whisper.cpp 실행 파일 선택',
      selectWhisperMessage: 'whisper.cpp가 빌드한 실행 파일을 선택하세요.',
      selectWhisperCancel: 'ASR 엔진 선택을 취소했습니다.',
      selectWhisperSuccess: (path) => `ASR 엔진을 선택했습니다: ${path}`,
      selectWhisperCompatSuccess: (path) => `ASR 엔진을 선택했습니다: ${path} (호환 버전으로 자동 전환됨)`,
      selectWhisperFailed: '선택한 파일은 ASR 엔진으로 사용할 수 없습니다.',
      clipExportSaveTitle: '클립 저장 위치 선택',
      clipExportSaveConfirm: '내보내기'
    },
    asrModelStatus: {
      missing: '모델 미설치',
      downloading: '모델 다운로드 중',
      installedNeedsRuntime: '모델 설치됨',
      installedReady: '모델 설치됨',
      progressLabel: '작업 중'
    },
    modelSources: {
      modelscope: {
        title: 'ModelScope',
        description: '중국 본토 네트워크에 적합하며 보통 추가 프록시 없이 사용할 수 있습니다.',
        hint: '중국 본토에 권장',
        region: '중국 본토'
      },
      huggingface: {
        title: 'Hugging Face',
        description: '해외 네트워크나 안정적인 국제 프록시가 있는 환경에 적합합니다.',
        hint: '해외 네트워크에 권장',
        region: '국제'
      }
    },
    probeFieldLabels: {
      'filename': '파일 이름',
      'nb_streams': '스트림 수',
      'nb_programs': '프로그램 수',
      'nb_stream_groups': '스트림 그룹 수',
      'format_name': '포맷 이름',
      'format_long_name': '포맷 전체 이름',
      'start_time': '시작 시간',
      'duration': '길이',
      'duration_ts': '길이 TS',
      'size': '크기',
      'bit_rate': '비트레이트',
      'probe_score': '탐지 점수',
      'tags.major_brand': '메이저 브랜드',
      'tags.minor_version': '마이너 버전',
      'tags.compatible_brands': '호환 브랜드',
      'tags.encoder': '인코더',
      'tags.comment': '설명',
      'tags.language': '언어',
      'tags.handler_name': '핸들러 이름',
      'codec_name': '코덱 이름',
      'codec_long_name': '코덱 전체 이름',
      'codec_type': '코덱 유형',
      'codec_tag': '코덱 태그',
      'codec_tag_string': '코덱 태그 문자열',
      'profile': '프로필',
      'width': '너비',
      'height': '높이',
      'coded_width': '인코딩 너비',
      'coded_height': '인코딩 높이',
      'closed_captions': '폐쇄 자막',
      'film_grain': '필름 그레인',
      'has_b_frames': 'B 프레임',
      'sample_aspect_ratio': '샘플 종횡비',
      'display_aspect_ratio': '디스플레이 종횡비',
      'pix_fmt': '픽셀 포맷',
      'level': '레벨',
      'color_range': '색상 범위',
      'color_space': '색상 공간',
      'color_transfer': '색상 전송',
      'color_primaries': '색상 기본값',
      'chroma_location': '크로마 위치',
      'field_order': '필드 순서',
      'refs': '레퍼런스',
      'r_frame_rate': '프레임레이트',
      'avg_frame_rate': '평균 프레임레이트',
      'time_base': '시간 기준',
      'start_pts': '시작 PTS',
      'start_time.2': '시작 시간',
      'extradata_size': '추가 데이터 크기',
      'disposition.default': '기본',
      'disposition.dub': '더빙',
      'disposition.original': '원본',
      'disposition.comment': '설명',
      'disposition.lyrics': '가사',
      'disposition.karaoke': '노래방',
      'disposition.forced': '강제',
      'disposition.hearing_impaired': '청각 장애',
      'disposition.visual_impaired': '시각 장애',
      'disposition.clean_effects': '클린 이펙트',
      'disposition.attached_pic': '첨부 이미지',
      'disposition.timed_thumbnails': '타임 썸네일',
      'disposition.non_diegetic': '논 다이제스틱',
      'disposition.captions': '캡션',
      'disposition.descriptions': '설명',
      'disposition.metadata': '메타데이터',
      'disposition.dependent': '종속',
      'disposition.still_image': '정지 이미지',
      'disposition.multilayer': '멀티 레이어',
      'channel_layout': '채널 레이아웃',
      'channels': '채널 수',
      'bits_per_sample': '샘플 비트 수',
      'sample_fmt': '샘플 포맷',
      'sample_rate': '샘플레이트'
    }
  }
}

export function getAppCopy(locale: AppLocale = DEFAULT_APP_LOCALE): LocaleCopy {
  return APP_COPY[locale]
}

export function getDefaultSubtitleLanguage(): SubtitleLanguageId {
  return DEFAULT_SUBTITLE_LANGUAGE
}
