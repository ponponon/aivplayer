import { AudioLines, CloudDownload, FolderOpen, PanelRight, RefreshCcw, Sparkles, Volume2, X } from 'lucide-react'
import { useEffect, useLayoutEffect, useRef, useState, type ReactElement } from 'react'
import type { AppPanelModePreference, AppSettings, AppSettingsSectionId } from '../../../shared/app-settings'
import type { AsrModelSourceId, AsrRuntimeStatus, AsrRuntimeSetupResult } from '../../../shared/media-types'
import { useModalFocusTrap } from './use-modal-focus-trap'

type SettingsDialogProps = {
  settings: AppSettings
  asrStatus: AsrRuntimeStatus | null
  runtimeSetupMessage: AsrRuntimeSetupResult | null
  isDetectingWhisperBinary: boolean
  isSelectingWhisperBinary: boolean
  initialSectionId?: AppSettingsSectionId
  onChange: (updater: (current: AppSettings) => AppSettings) => void
  onClose: () => void
  onAutoDetectWhisperBinary: () => void
  onOpenAsrPanel: () => void
  onSelectWhisperBinary: () => void
  onResetDefaults: () => void
}

const panelModeOptions: Array<{
  value: AppPanelModePreference
  title: string
  description: string
}> = [
  {
    value: 'playlist',
    title: '播放列表',
    description: '启动后先看队列，适合连续切换本地视频。'
  },
  {
    value: 'asr',
    title: 'ASR',
    description: '启动后直接进入模型和字幕工作流。'
  },
  {
    value: 'info',
    title: '媒体信息',
    description: '启动后先看当前文件与播放状态。'
  }
]

const asrModelSourceOptions: Array<{
  value: AsrModelSourceId
  title: string
  description: string
  hint: string
}> = [
  {
    value: 'modelscope',
    title: 'ModelScope',
    description: '中国大陆网络优先，通常不需要额外代理。',
    hint: '推荐给国内网络'
  },
  {
    value: 'huggingface',
    title: 'Hugging Face',
    description: '海外网络或稳定国际代理环境优先。',
    hint: '推荐给海外网络'
  }
]

const settingsSectionTabs: Array<{
  id: AppSettingsSectionId
  label: string
  ariaLabel: string
  icon: typeof PanelRight
}> = [
  {
    id: 'startup',
    label: '启动',
    ariaLabel: '跳到启动侧栏设置',
    icon: PanelRight
  },
  {
    id: 'playback',
    label: '播放',
    ariaLabel: '跳到播放记忆设置',
    icon: Volume2
  },
  {
    id: 'asr',
    label: 'ASR',
    ariaLabel: '跳到 ASR 相关设置',
    icon: AudioLines
  }
]

const SETTINGS_SECTION_SCROLL_OFFSET = 78

export function SettingsDialog({
  settings,
  asrStatus,
  runtimeSetupMessage,
  isDetectingWhisperBinary,
  isSelectingWhisperBinary,
  initialSectionId = 'startup',
  onChange,
  onClose,
  onAutoDetectWhisperBinary,
  onOpenAsrPanel,
  onSelectWhisperBinary,
  onResetDefaults
}: SettingsDialogProps): ReactElement {
  const [activeSectionId, setActiveSectionId] = useState<AppSettingsSectionId>(initialSectionId)
  const hasMountedRef = useRef(false)
  const initialScrollDoneRef = useRef(false)
  const dialogRef = useRef<HTMLElement | null>(null)
  const activeSectionIdRef = useRef<AppSettingsSectionId>(initialSectionId)
  const scrollFrameRef = useRef<number | null>(null)
  const patchSettings = (updater: (current: AppSettings) => AppSettings): void => {
    onChange(updater)
  }
  const isRuntimeActionBusy = isDetectingWhisperBinary || isSelectingWhisperBinary

  useEffect(() => {
    activeSectionIdRef.current = activeSectionId
  }, [activeSectionId])

  useLayoutEffect(() => {
    if (initialScrollDoneRef.current) {
      return
    }

    initialScrollDoneRef.current = true
    const element = document.getElementById(`settings-section-${initialSectionId}`)
    element?.scrollIntoView({
      behavior: 'auto',
      block: 'start'
    })
  }, [initialSectionId])

  useModalFocusTrap(true, dialogRef, '.settings-tab.active')

  useEffect(() => {
    return () => {
      if (scrollFrameRef.current != null) {
        window.cancelAnimationFrame(scrollFrameRef.current)
      }
    }
  }, [])

  useEffect(() => {
    if (!hasMountedRef.current) {
      hasMountedRef.current = true
      return
    }

    setActiveSectionId(settings.ui.lastSettingsSectionId)
  }, [settings.ui.lastSettingsSectionId])

  const selectSection = (sectionId: AppSettingsSectionId): void => {
    if (activeSectionIdRef.current !== sectionId) {
      activeSectionIdRef.current = sectionId
      setActiveSectionId(sectionId)
      patchSettings((current) => ({
        ...current,
        ui: {
          ...current.ui,
          lastSettingsSectionId: sectionId
        }
      }))
    }
  }

  const syncSectionFromScroll = (): void => {
    scrollFrameRef.current = null

    const container = dialogRef.current
    if (!container) {
      return
    }

    const containerTop = container.getBoundingClientRect().top
    let nextSectionId = activeSectionIdRef.current
    let bestDistance = Number.NEGATIVE_INFINITY

    for (const section of settingsSectionTabs) {
      const element = document.getElementById(`settings-section-${section.id}`)
      if (!element) {
        continue
      }

      const distance = element.getBoundingClientRect().top - containerTop
      if (distance <= SETTINGS_SECTION_SCROLL_OFFSET && distance > bestDistance) {
        bestDistance = distance
        nextSectionId = section.id
      }
    }

    selectSection(nextSectionId)
  }

  const handleDialogScroll = (): void => {
    if (scrollFrameRef.current != null) {
      return
    }

    scrollFrameRef.current = window.requestAnimationFrame(syncSectionFromScroll)
  }

  const scrollToSection = (sectionId: AppSettingsSectionId): void => {
    selectSection(sectionId)

    const element = document.getElementById(`settings-section-${sectionId}`)
    element?.scrollIntoView({
      behavior: 'smooth',
      block: 'start'
    })
  }

  return (
    <div
      className="modal-backdrop"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) {
          onClose()
        }
      }}
    >
      <section
        ref={dialogRef}
        className="settings-dialog"
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-labelledby="settings-dialog-title"
        aria-describedby="settings-dialog-description"
        onScroll={handleDialogScroll}
      >
        <div className="settings-dialog-header">
          <div>
            <span className="panel-kicker">Preferences</span>
            <h2 id="settings-dialog-title">设置</h2>
            <p id="settings-dialog-description">偏好会自动保存到本地，下次启动继续生效。</p>
          </div>
          <button className="mini-tool-button" type="button" onClick={onClose} title="关闭设置">
            <X size={14} />
          </button>
        </div>

        <nav className="settings-switcher" role="tablist" aria-label="设置分组">
          {settingsSectionTabs.map((section) => {
            const Icon = section.icon
            const isActive = activeSectionId === section.id

            return (
              <button
                className={`settings-tab ${isActive ? 'active' : ''}`}
                key={section.id}
                type="button"
                role="tab"
                aria-selected={isActive}
                aria-label={section.ariaLabel}
                data-settings-tab={section.id}
                onClick={() => scrollToSection(section.id)}
              >
                <Icon size={14} />
                <span>{section.label}</span>
              </button>
            )
          })}
        </nav>

        <div className="settings-grid">
          <section className="settings-card settings-card-anchor" id="settings-section-startup">
            <div className="settings-card-heading">
              <PanelRight size={16} />
              <span>启动侧栏</span>
            </div>
            <div className="settings-choice-list" role="radiogroup" aria-label="启动侧栏">
              {panelModeOptions.map((option) => (
                <label className="setting-choice" key={option.value}>
                  <input
                    type="radio"
                    name="default-panel-mode"
                    checked={settings.ui.defaultPanelMode === option.value}
                    onChange={() =>
                      patchSettings((current) => ({
                        ...current,
                        ui: {
                          ...current.ui,
                          defaultPanelMode: option.value
                        }
                      }))
                    }
                  />
                  <span>
                    <strong>{option.title}</strong>
                    <small>{option.description}</small>
                  </span>
                </label>
              ))}
            </div>
          </section>

          <section className="settings-card settings-card-anchor" id="settings-section-playback">
            <div className="settings-card-heading">
              <Volume2 size={16} />
              <span>播放记忆</span>
            </div>
            <label className="setting-toggle">
              <input
                type="checkbox"
                checked={settings.playback.rememberVolume}
                onChange={(event) =>
                  patchSettings((current) => ({
                    ...current,
                    playback: {
                      ...current.playback,
                      rememberVolume: event.currentTarget.checked
                    }
                  }))
                }
              />
              <span>
                <strong>记住音量和静音状态</strong>
                <small>下次打开视频时沿用最近一次的音量和静音状态。</small>
              </span>
            </label>
            <label className="setting-toggle">
              <input
                type="checkbox"
                checked={settings.playback.rememberPlaybackRate}
                onChange={(event) =>
                  patchSettings((current) => ({
                    ...current,
                    playback: {
                      ...current.playback,
                      rememberPlaybackRate: event.currentTarget.checked
                    }
                  }))
                }
              />
              <span>
                <strong>记住倍速</strong>
                <small>播放速率会保留到下次启动，适合长期固定习惯。</small>
              </span>
            </label>
          </section>

          <section className="settings-card settings-card-wide settings-card-anchor" id="settings-section-asr">
            <div className="settings-card-heading">
              <AudioLines size={16} />
              <span>ASR 引擎</span>
            </div>
            <p className="settings-card-note">
              这个区域只负责配置 whisper.cpp 和 ffmpeg 的位置。模型下载与字幕生成继续留在 ASR 工作区。
            </p>
            <div className="asr-runtime-grid">
              <span>ASR 引擎 whisper.cpp</span>
              <strong>{asrStatus?.binaryPath ? asrStatus.binaryPath : '未找到'}</strong>
              <span>ffmpeg</span>
              <strong>{asrStatus?.ffmpegPath ? asrStatus.ffmpegPath : '未找到'}</strong>
            </div>
            {runtimeSetupMessage ? (
              <div className={`asr-result ${runtimeSetupMessage.success ? 'success' : 'failed'}`}>
                {runtimeSetupMessage.message}
              </div>
            ) : null}
            <div className="asr-action-row">
              <button
                className="asr-action-button"
                type="button"
                onClick={onAutoDetectWhisperBinary}
                disabled={isRuntimeActionBusy}
                title="自动检测 whisper.cpp"
                aria-label="自动检测 whisper.cpp"
              >
                <RefreshCcw size={16} />
                {isDetectingWhisperBinary ? '检测中' : '自动检测'}
              </button>
              <button
                className="asr-action-button"
                type="button"
                onClick={onSelectWhisperBinary}
                disabled={isRuntimeActionBusy}
                title="选择 whisper.cpp 可执行文件"
                aria-label={asrStatus?.binaryPath ? '更换 ASR 引擎' : '选择 whisper.cpp 可执行文件'}
              >
                <FolderOpen size={16} />
                {isSelectingWhisperBinary ? '选择中' : asrStatus?.binaryPath ? '更换引擎' : '选择文件'}
              </button>
            </div>
          </section>

          <section className="settings-card settings-card-wide">
            <div className="settings-card-heading">
              <CloudDownload size={16} />
              <span>ASR 模型下载</span>
            </div>
            <div className="settings-choice-list" role="radiogroup" aria-label="ASR 模型默认下载源">
              {asrModelSourceOptions.map((option) => (
                <label className="setting-choice" key={option.value}>
                  <input
                    type="radio"
                    name="default-asr-model-source"
                    checked={settings.asr.preferredModelSourceId === option.value}
                    onChange={() =>
                      patchSettings((current) => ({
                        ...current,
                        asr: {
                          ...current.asr,
                          preferredModelSourceId: option.value
                        }
                      }))
                    }
                  />
                  <span>
                    <strong>{option.title}</strong>
                    <small>{option.description}</small>
                    <small>{option.hint}</small>
                  </span>
                </label>
              ))}
            </div>
            <p className="settings-card-note">
              下载弹窗会优先把这里选中的源排在前面，但你仍然可以在弹窗里临时切换。
            </p>
          </section>
        </div>

        <div className="settings-footer">
          <div className="settings-note">
            <Sparkles size={14} />
            <span>ASR 引擎、模型下载默认源和播放偏好都集中在这里，ASR 面板只保留运行态操作。</span>
          </div>
          <div className="settings-footer-actions">
            <button className="settings-secondary-button" type="button" onClick={onResetDefaults}>
              恢复默认设置
            </button>
            <button className="asr-action-button" type="button" onClick={onOpenAsrPanel}>
              <Sparkles size={16} />
              打开 ASR 面板
            </button>
          </div>
        </div>
      </section>
    </div>
  )
}
