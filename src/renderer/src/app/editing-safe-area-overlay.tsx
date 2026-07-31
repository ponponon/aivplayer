import type { EditingCanvasPresetId } from '../../../shared/editing-types'

type Props = { canvasPreset: EditingCanvasPresetId }

export function EditingSafeAreaOverlay({ canvasPreset }: Props): React.ReactElement | null {
  if (canvasPreset === 'source') return null
  return <div className={`editing-safe-area-overlay is-${canvasPreset}`} data-testid="editing-safe-area-overlay" aria-hidden="true"><span className="editing-safe-area-outer" /><span className="editing-safe-area-inner" /></div>
}
