import { SubtitleOverlay } from '../subtitle-overlay'
import { PlaybackControls } from './playback-controls'
import { VideoSurface } from './video-surface'
import { useAppContext } from './app-context'

export function PlayerStage(): React.ReactElement {
  const app = useAppContext()
  return <section className={`stage ${app.isControlDeckHidden ? 'control-deck-hidden' : ''}`} aria-label={app.copy.emptyState.title} onMouseEnter={app.revealControlDeck} onMouseMove={app.revealControlDeck}><div className="video-frame"><VideoSurface /></div><SubtitleOverlay subtitlePath={app.activeSubtitle?.subtitlePath ?? null} translationPath={app.translatedSubtitleResult?.subtitlePath ?? null} currentTime={app.state.currentTime} settings={app.appSettings.subtitles} copy={app.copy} controlsRef={app.subtitleDisplayControlsRef} onSettingsChange={app.patchSubtitleDisplaySettings} onResetSettings={app.resetSubtitleDisplaySettings} />{app.state.error ? <div className="status-banner"><span>{app.state.error}</span></div> : null}<PlaybackControls /></section>
}
