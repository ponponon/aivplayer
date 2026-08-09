import { performance } from 'node:perf_hooks'
import { SpeakerDiarizationRuntime } from '../src/core/ai/speaker-diarization-runtime'

const modelRoot = process.env.AIVPLAYER_SPEAKER_MODEL_ROOT
const audioPath = process.env.AIVPLAYER_SPEAKER_AUDIO_PATH
if (!modelRoot || !audioPath) {
  throw new Error('请设置 AIVPLAYER_SPEAKER_MODEL_ROOT 和 AIVPLAYER_SPEAKER_AUDIO_PATH 后再运行说话人 Smoke。')
}

const rawNumClusters = process.env.AIVPLAYER_SPEAKER_NUM_CLUSTERS
const numClusters = rawNumClusters ? Number.parseInt(rawNumClusters, 10) : undefined
const runtime = new SpeakerDiarizationRuntime({ userDataPath: modelRoot })
const startedAt = performance.now()
const result = await runtime.diarizeWaveFile(audioPath, { numClusters })
const speakerIds = [...new Set(result.segments.map((segment) => segment.speakerId))].sort((a, b) => a - b)

console.log(JSON.stringify({
  elapsedMs: Math.round(performance.now() - startedAt),
  sampleRate: result.sampleRate,
  durationSeconds: result.durationSeconds,
  segmentCount: result.segments.length,
  speakerIds,
  firstSegment: result.segments[0] ?? null,
  lastSegment: result.segments.at(-1) ?? null
}, null, 2))
