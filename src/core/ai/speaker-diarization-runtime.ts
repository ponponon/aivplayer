import { createRequire } from 'node:module'
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
  readWave: (filePath: string) => Wave
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
  if (typeof module?.readWave !== 'function' || typeof module?.OfflineSpeakerDiarization !== 'function') {
    throw new Error('sherpa-onnx 原生模块缺少 readWave 或 OfflineSpeakerDiarization 接口')
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
    const wave = module.readWave(audioPath)
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
