import { SubtitleOverlay } from '../subtitle-overlay'
import { PlaybackControls } from './playback-controls'
import { VideoSurface } from './video-surface'
import { useAppContext } from './app-context'
import { EditingTimeline } from './editing-timeline'

export function PlayerStage(): React.ReactElement {
  const app = useAppContext()
  return <section className={`stage ${app.isControlDeckHidden && !app.isEditingMode ? 'control-deck-hidden' : ''} ${app.isEditingMode ? 'is-editing' : ''}`} aria-label={app.copy.emptyState.title} onMouseEnter={app.revealControlDeck} onMouseMove={app.revealControlDeck}><div className="video-frame"><VideoSurface /></div><SubtitleOverlay subtitlePath={app.isEditingMode ? null : app.activeSubtitle?.subtitlePath ?? null} translationPath={app.isEditingMode ? null : app.translatedSubtitleResult?.subtitlePath ?? null} editingCaptions={app.isEditingMode ? app.editingProject?.captions ?? null : null} currentTime={app.isEditingMode ? app.editingCurrentTime : app.state.currentTime} settings={app.appSettings.subtitles} copy={app.copy} controlsRef={app.subtitleDisplayControlsRef} onSettingsChange={app.patchSubtitleDisplaySettings} onResetSettings={app.resetSubtitleDisplaySettings} />{app.state.error ? <div className="status-banner"><span>{app.state.error}</span></div> : null}{app.isEditingMode ? <EditingTimeline /> : <PlaybackControls />}</section>
}
