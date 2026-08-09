import { createRequire } from 'node:module'
import { readFile } from 'node:fs/promises'
import { delimiter as pathDelimiter, dirname } from 'node:path'
import type {
  SpeakerDiarizationModelStatus,
  SpeakerDiarizationResult,
  SpeakerDiarizationSegment
} from '../../shared/speaker-diarization-types'
import {
  getSpeakerDiarizationModelPaths,
  getSpeakerDiarizationModelStatus,
  getSpeakerDiarizationPlatformCapability
} from './speaker-diarization-model'

type Wave = {
  sampleRate: number
  samples: Float32Array
}

type NativeSpeakerDiarizationConfig = {
  segmentation: { pyannote: { model: string } }
  embedding: { model: string }
  clustering: { numClusters: number; threshold: number }
  minDurationOn: number
  minDurationOff: number
}

type NativeSpeakerDiarization = {
  sampleRate: number
  process: (samples: Float32Array) => Array<{ start: number; end: number; speaker: number }>
}

type NativeSpeakerDiarizationModule = {
  OfflineSpeakerDiarization: new (config: NativeSpeakerDiarizationConfig) => NativeSpeakerDiarization
}

export type SpeakerDiarizationRuntimeOptions = {
  userDataPath: string
  platform?: NodeJS.Platform
  arch?: string
  loadModule?: (nativePackageId: string) => Promise<unknown> | unknown
}

export type SpeakerDiarizationRunOptions = {
  numClusters?: number
  threshold?: number
  minDurationOn?: number
  minDurationOff?: number
}

const require = createRequire(import.meta.url)
const EXPECTED_SAMPLE_RATE = 16_000

function readWaveText(bytes: Uint8Array, offset: number, length: number): string {
  return String.fromCharCode(...bytes.subarray(offset, offset + length))
}

async function readPcmWaveFile(filePath: string): Promise<Wave> {
  const file = await readFile(filePath)
  const bytes = new Uint8Array(file.buffer, file.byteOffset, file.byteLength)
  const view = new DataView(file.buffer, file.byteOffset, file.byteLength)
  if (readWaveText(bytes, 0, 4) !== 'RIFF' || readWaveText(bytes, 8, 4) !== 'WAVE') {
    throw new Error('说话人 Provider 只接受标准 RIFF/WAVE 音频')
  }

  let format: { audioFormat: number; channels: number; sampleRate: number; blockAlign: number; bitsPerSample: number } | null = null
  let dataOffset = -1
  let dataSize = 0
  for (let offset = 12; offset + 8 <= bytes.length;) {
    const chunkId = readWaveText(bytes, offset, 4)
    const chunkSize = view.getUint32(offset + 4, true)
    const chunkDataOffset = offset + 8
    if (chunkDataOffset + chunkSize > bytes.length) throw new Error('说话人 Provider 读取到损坏的 WAV 分块')
    if (chunkId === 'fmt ' && chunkSize >= 16) {
      format = {
        audioFormat: view.getUint16(chunkDataOffset, true),
        channels: view.getUint16(chunkDataOffset + 2, true),
        sampleRate: view.getUint32(chunkDataOffset + 4, true),
        blockAlign: view.getUint16(chunkDataOffset + 12, true),
        bitsPerSample: view.getUint16(chunkDataOffset + 14, true)
      }
    } else if (chunkId === 'data') {
      dataOffset = chunkDataOffset
      dataSize = chunkSize
    }
    offset = chunkDataOffset + chunkSize + (chunkSize % 2)
  }

  if (!format || dataOffset < 0 || format.audioFormat !== 1 || format.channels < 1 || format.bitsPerSample !== 16 || format.blockAlign !== format.channels * 2) {
    throw new Error('说话人 Provider 需要 16-bit PCM WAV 音频')
  }
  if (dataSize < format.blockAlign || dataSize % format.blockAlign !== 0) throw new Error('说话人 Provider 读取到的 WAV 没有完整音频帧')

  const frameCount = dataSize / format.blockAlign
  const samples = new Float32Array(frameCount)
  for (let frame = 0; frame < frameCount; frame += 1) {
    let sum = 0
    for (let channel = 0; channel < format.channels; channel += 1) {
      sum += view.getInt16(dataOffset + frame * format.blockAlign + channel * 2, true) / 32768
    }
    samples[frame] = sum / format.channels
  }
  return { sampleRate: format.sampleRate, samples }
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

function appendNativeLibraryPath(environmentName: 'DYLD_LIBRARY_PATH' | 'LD_LIBRARY_PATH' | 'PATH', directory: string): void {
  const current = process.env[environmentName]
  const entries = current ? current.split(pathDelimiter) : []
  if (!entries.includes(directory)) {
    process.env[environmentName] = [directory, ...entries].filter(Boolean).join(pathDelimiter)
  }
}

function loadNativeModule(nativePackageId: string): unknown {
  const nativePackageDirectory = dirname(require.resolve(`${nativePackageId}/package.json`))
  if (process.platform === 'darwin') appendNativeLibraryPath('DYLD_LIBRARY_PATH', nativePackageDirectory)
  if (process.platform === 'linux') appendNativeLibraryPath('LD_LIBRARY_PATH', nativePackageDirectory)
  if (process.platform === 'win32') appendNativeLibraryPath('PATH', nativePackageDirectory)
  return require('sherpa-onnx-node')
}

function toNativeModule(value: unknown): NativeSpeakerDiarizationModule {
  const module = value as Partial<NativeSpeakerDiarizationModule> | null
  if (typeof module?.OfflineSpeakerDiarization !== 'function') {
    throw new Error('sherpa-onnx 原生模块缺少 OfflineSpeakerDiarization 接口')
  }
  return module as NativeSpeakerDiarizationModule
}

function clampPositive(value: number | undefined, fallback: number): number {
  return Number.isFinite(value) && (value as number) >= 0 ? value as number : fallback
}

/** Local-only sherpa-onnx runtime. It never downloads model or audio assets. */
export class SpeakerDiarizationRuntime {
  private readonly userDataPath: string
  private readonly platform?: NodeJS.Platform
  private readonly arch?: string
  private readonly moduleLoader: (nativePackageId: string) => Promise<unknown> | unknown
  private modulePromise: Promise<NativeSpeakerDiarizationModule> | null = null

  constructor(options: SpeakerDiarizationRuntimeOptions) {
    this.userDataPath = options.userDataPath
    this.platform = options.platform
    this.arch = options.arch
    this.moduleLoader = options.loadModule ?? loadNativeModule
  }

  getStatus(): SpeakerDiarizationModelStatus {
    return getSpeakerDiarizationModelStatus(this.userDataPath, this.platform, this.arch)
  }

  async prepare(): Promise<void> {
    await this.getModule()
  }

  async diarizeWaveFile(audioPath: string, options: SpeakerDiarizationRunOptions = {}): Promise<SpeakerDiarizationResult> {
    const status = this.getStatus()
    if (!status.available) throw new Error(status.message)

    const module = await this.getModule()
    const wave = await readPcmWaveFile(audioPath)
    if (!Number.isFinite(wave.sampleRate) || wave.sampleRate !== EXPECTED_SAMPLE_RATE) {
      throw new Error(`说话人 Provider 需要 ${EXPECTED_SAMPLE_RATE} Hz 单声道 WAV，当前采样率为 ${wave.sampleRate} Hz`)
    }
    if (!(wave.samples instanceof Float32Array) || wave.samples.length === 0) {
      throw new Error('说话人 Provider 读取到的 WAV 没有有效音频样本')
    }

    const paths = getSpeakerDiarizationModelPaths(status.modelDirectory)
    const diarization = new module.OfflineSpeakerDiarization({
      segmentation: { pyannote: { model: paths.segmentationModelPath } },
      embedding: { model: paths.embeddingModelPath },
      clustering: {
        numClusters: Number.isInteger(options.numClusters) ? options.numClusters as number : -1,
        threshold: clampPositive(options.threshold, 0.5)
      },
      minDurationOn: clampPositive(options.minDurationOn, 0.2),
      minDurationOff: clampPositive(options.minDurationOff, 0.5)
    })
    if (!Number.isFinite(diarization.sampleRate) || diarization.sampleRate !== wave.sampleRate) {
      throw new Error(`说话人 Provider 模型采样率为 ${diarization.sampleRate} Hz，与音频 ${wave.sampleRate} Hz 不一致`)
    }

    const segments: SpeakerDiarizationSegment[] = diarization.process(wave.samples)
      .filter((segment) => Number.isFinite(segment.start) && Number.isFinite(segment.end) && Number.isFinite(segment.speaker) && segment.end > segment.start)
      .map((segment) => ({ startSeconds: Math.max(0, segment.start), endSeconds: segment.end, speakerId: Math.max(0, Math.trunc(segment.speaker)) }))

    return {
      sampleRate: wave.sampleRate,
      durationSeconds: wave.samples.length / wave.sampleRate,
      segments
    }
  }

  private getModule(): Promise<NativeSpeakerDiarizationModule> {
    if (this.modulePromise) return this.modulePromise
    const status = this.getStatus()
    if (!status.platform.supported || !status.platform.nativePackageId) {
      return Promise.reject(new Error(status.platform.reason))
    }
    if (!status.modelFilesAvailable) return Promise.reject(new Error(status.message))

    this.modulePromise = Promise.resolve(this.moduleLoader(status.platform.nativePackageId))
      .then(toNativeModule)
      .catch((error) => {
        this.modulePromise = null
        throw new Error(`无法加载 sherpa-onnx 原生 Provider：${errorMessage(error)}`)
      })
    return this.modulePromise
  }
}

export { EXPECTED_SAMPLE_RATE }
