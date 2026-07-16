import { AsrModelCard } from './asr-model-card'
import { AsrRuntimeCard } from './asr-runtime-card'
import { SubtitleToolsCard } from './subtitle-tools-card'

export function AsrPanel(): React.ReactElement {
  return <div className="asr-stack"><AsrRuntimeCard /><AsrModelCard /><SubtitleToolsCard /></div>
}
