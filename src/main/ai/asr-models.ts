import type { AsrModelDownloadSource, AsrModelManifest, AsrModelSourceId } from '../../shared/media-types.ts'

const HUGGING_FACE_WHISPER_CPP_BASE = 'https://huggingface.co/ggerganov/whisper.cpp/resolve/main'
const MODELSCOPE_WHISPER_CPP_BASE = 'https://modelscope.cn/models/timeless/whispercpp/resolve/master'
const LARGE_V3_TURBO_Q5_0_FILE = 'ggml-large-v3-turbo-q5_0.bin'
const SMALL_Q5_1_FILE = 'ggml-small-q5_1.bin'

const largeV3TurboQ50Sources: AsrModelDownloadSource[] = [
  {
    id: 'modelscope',
    name: 'ModelScope',
    region: '中国大陆',
    url: `${MODELSCOPE_WHISPER_CPP_BASE}/${LARGE_V3_TURBO_Q5_0_FILE}`,
    description: '阿里云魔搭社区镜像源，适合中国大陆网络，通常不需要额外代理。',
    sha256: '394221709cd5ad1f40c46e6031ca61bce88931e6e088c188294c6d5a55ffa7e2'
  },
  {
    id: 'huggingface',
    name: 'Hugging Face',
    region: '国际',
    url: `${HUGGING_FACE_WHISPER_CPP_BASE}/${LARGE_V3_TURBO_Q5_0_FILE}`,
    description: 'whisper.cpp 官方模型源，适合海外网络，或已经配置稳定国际代理的环境。',
    sha256: '394221709cd5ad1f40c46e6031ca61bce88931e6e088c188294c6d5a55ffa7e2'
  }
]

export const WHISPER_MODEL_MANIFESTS: AsrModelManifest[] = [
  {
    id: 'large-v3-turbo-q5_0',
    name: 'Whisper large-v3-turbo q5_0',
    fileName: LARGE_V3_TURBO_Q5_0_FILE,
    sources: largeV3TurboQ50Sources,
    expectedSizeBytes: 574_041_195,
    ramRequirement: '建议预留 2-3 GB 可用内存',
    description: '默认高质量模式，适合本地自动字幕生成。'
  },
  {
    id: 'small-q5_1',
    name: 'Whisper small q5_1',
    fileName: SMALL_Q5_1_FILE,
    sources: [
      {
        id: 'huggingface',
        name: 'Hugging Face',
        region: '国际',
        url: `${HUGGING_FACE_WHISPER_CPP_BASE}/${SMALL_Q5_1_FILE}`,
        description: 'whisper.cpp 官方模型源，适合海外网络，或已经配置稳定国际代理的环境。'
      }
    ],
    expectedSizeBytes: 181 * 1024 * 1024,
    ramRequirement: '建议预留 1 GB 可用内存',
    description: '低配快速模式，适合先验证流程或低内存机器。'
  }
]

export function getRecommendedWhisperModelManifest(): AsrModelManifest {
  return WHISPER_MODEL_MANIFESTS[0]
}

export function findWhisperModelManifest(modelIdOrFileName: string): AsrModelManifest | null {
  return (
    WHISPER_MODEL_MANIFESTS.find(
      (model) => model.id === modelIdOrFileName || model.fileName === modelIdOrFileName
    ) ?? null
  )
}

export function selectWhisperModelDownloadSource(
  manifest: AsrModelManifest,
  sourceId?: AsrModelSourceId
): AsrModelDownloadSource {
  const source = sourceId ? manifest.sources.find((item) => item.id === sourceId) : manifest.sources[0]

  if (!source) {
    throw new Error(`未找到模型下载源：${sourceId ?? 'default'}。`)
  }

  return source
}
