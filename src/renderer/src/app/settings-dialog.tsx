import { PanelRight, Settings2, Sparkles, Volume2, X } from 'lucide-react'
import type { ReactElement } from 'react'
import type { AppPanelModePreference, AppSettings } from '../../../shared/app-settings'

type SettingsDialogProps = {
  settings: AppSettings
  onChange: (updater: (current: AppSettings) => AppSettings) => void
  onClose: () => void
  onOpenAsrPanel: () => void
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

export function SettingsDialog({ settings, onChange, onClose, onOpenAsrPanel }: SettingsDialogProps): ReactElement {
  const patchSettings = (updater: (current: AppSettings) => AppSettings): void => {
    onChange(updater)
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
        className="settings-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="settings-dialog-title"
        aria-describedby="settings-dialog-description"
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

        <div className="settings-grid">
          <section className="settings-card">
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

          <section className="settings-card">
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
        </div>

        <div className="settings-footer">
          <div className="settings-note">
            <Sparkles size={14} />
            <span>ASR 引擎路径和模型下载仍在 ASR 面板中管理。</span>
          </div>
          <button className="asr-action-button" type="button" onClick={onOpenAsrPanel}>
            <Settings2 size={16} />
            打开 ASR 面板
          </button>
        </div>
      </section>
    </div>
  )
}
