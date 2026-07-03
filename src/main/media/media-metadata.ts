import { existsSync } from 'node:fs'
import { stat } from 'node:fs/promises'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { resolveFfprobePath, resolveFfmpegPath } from '../ai/whisper-cpp-runtime'
import type {
  MediaAudioMetadata,
  MediaProbeDetailObject,
  MediaProbeDetails,
  MediaProbeMetadata,
  MediaVideoMetadata
} from '../../shared/media-types'

const execFileAsync = promisify(execFile)
const FFPROBE_TIMEOUT_MS = 6000
const FFPROBE_MAX_BUFFER_BYTES = 2 * 1024 * 1024
const FFMPEG_TIMEOUT_MS = 6000
const FFMPEG_MAX_BUFFER_BYTES = 1024 * 1024

let cachedFfprobePathPromise: Promise<string | null> | null = null
let cachedFfmpegPathPromise: Promise<string | null> | null = null

type ProbeSummary = {
  durationSeconds: number | null
  overallBitrateKbps: number | null
  video: MediaVideoMetadata | null
  audio: MediaAudioMetadata | null
}

type FfprobeProbe = ProbeSummary & {
  details: MediaProbeDetails
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function toText(value: unknown): string | null {
  if (typeof value === 'string') {
    const trimmed = value.trim()
    return trimmed.length > 0 ? trimmed : null
  }

  if (typeof value === 'number' && Number.isFinite(value)) {
    return String(value)
  }

  if (typeof value === 'boolean') {
    return value ? 'true' : 'false'
  }

  return null
}

function toNumber(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value
  }

  if (typeof value !== 'string') {
    return null
  }

  const trimmed = value.trim()
  if (trimmed.length === 0) {
    return null
  }

  const parsed = Number(trimmed)
  return Number.isFinite(parsed) ? parsed : null
}

function parseClockTimeToSeconds(value: string): number | null {
  const match = /^(?:(\d+):)?(\d+):(\d+(?:\.\d+)?)$/.exec(value.trim())

  if (!match) {
    return null
  }

  const hours = Number(match[1] ?? '0')
  const minutes = Number(match[2])
  const seconds = Number(match[3])

  if (![hours, minutes, seconds].every(Number.isFinite)) {
    return null
  }

  return hours * 3600 + minutes * 60 + seconds
}

function parseFractionToNumber(value: unknown): number | null {
  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : null
  }

  if (typeof value !== 'string') {
    return null
  }

  const trimmed = value.trim()
  if (trimmed.length === 0 || trimmed === '0/0') {
    return null
  }

  const fractionMatch = /^(-?\d+(?:\.\d+)?)(?:\/(-?\d+(?:\.\d+)?))?$/.exec(trimmed)
  if (!fractionMatch) {
    const parsed = Number(trimmed)
    return Number.isFinite(parsed) ? parsed : null
  }

  const numerator = Number(fractionMatch[1])
  const denominator = fractionMatch[2] == null ? 1 : Number(fractionMatch[2])

  if (!Number.isFinite(numerator) || !Number.isFinite(denominator) || denominator === 0) {
    return null
  }

  return numerator / denominator
}

function parseBitRateKbps(value: unknown): number | null {
  const bitsPerSecond = toNumber(value)
  return bitsPerSecond == null ? null : bitsPerSecond / 1000
}

function parseCodecToken(token: string): { codec: string | null; profile: string | null } {
  const cleanedToken = token.trim()
  if (!cleanedToken) {
    return {
      codec: null,
      profile: null
    }
  }

  const firstParenIndex = cleanedToken.indexOf('(')
  const codec = (firstParenIndex === -1 ? cleanedToken : cleanedToken.slice(0, firstParenIndex)).trim()
  const profileMatch = /\(([^)]+)\)/.exec(cleanedToken)

  return {
    codec: codec || null,
    profile: profileMatch?.[1]?.trim() || null
  }
}

function splitStreamTokens(line: string, streamLabel: 'Video' | 'Audio'): string[] {
  const streamIndex = line.indexOf(`${streamLabel}:`)

  if (streamIndex === -1) {
    return []
  }

  return line
    .slice(streamIndex + streamLabel.length + 1)
    .split(',')
    .map((token) => token.trim())
    .filter(Boolean)
}

function parseVideoStreamLine(line: string): MediaVideoMetadata | null {
  const tokens = splitStreamTokens(line, 'Video')

  if (tokens.length === 0) {
    return null
  }

  const codecInfo = parseCodecToken(tokens[0] ?? '')
  const video: MediaVideoMetadata = {
    codec: codecInfo.codec,
    profile: codecInfo.profile,
    width: null,
    height: null,
    frameRate: null,
    displayAspectRatio: null,
    bitRateKbps: null
  }

  for (const token of tokens.slice(1)) {
    const resolutionMatch = /(\d+)\s*x\s*(\d+)(?:\s+\[SAR\s+[^\]]+\s+DAR\s+([^\]]+)\])?/i.exec(token)
    if (resolutionMatch) {
      video.width = Number(resolutionMatch[1])
      video.height = Number(resolutionMatch[2])
      video.displayAspectRatio = resolutionMatch[3]?.trim() ?? video.displayAspectRatio
      continue
    }

    const frameRateMatch = /(\d+(?:\.\d+)?)\s*fps\b/i.exec(token)
    if (frameRateMatch) {
      video.frameRate = Number(frameRateMatch[1])
      continue
    }

    const bitrateMatch = /(\d+(?:\.\d+)?)\s*kb\/s\b/i.exec(token)
    if (bitrateMatch) {
      video.bitRateKbps = Number(bitrateMatch[1])
    }
  }

  return video
}

function parseAudioStreamLine(line: string): MediaAudioMetadata | null {
  const tokens = splitStreamTokens(line, 'Audio')

  if (tokens.length === 0) {
    return null
  }

  const codecInfo = parseCodecToken(tokens[0] ?? '')
  const audio: MediaAudioMetadata = {
    codec: codecInfo.codec,
    profile: codecInfo.profile,
    channelLayout: null,
    sampleRateHz: null,
    bitRateKbps: null
  }

  for (const token of tokens.slice(1)) {
    const sampleRateMatch = /(\d+)\s*Hz\b/i.exec(token)
    if (sampleRateMatch) {
      audio.sampleRateHz = Number(sampleRateMatch[1])
      continue
    }

    const bitrateMatch = /(\d+(?:\.\d+)?)\s*kb\/s\b/i.exec(token)
    if (bitrateMatch) {
      audio.bitRateKbps = Number(bitrateMatch[1])
      continue
    }

    if (!audio.channelLayout && !/^(?:fltp|flt|s16|s24|s32|u8|u16|u24|u32|packed|planar)$/i.test(token)) {
      audio.channelLayout = token.replace(/\s*\(default\)$/i, '').trim()
    }
  }

  return audio
}

function normalizeDetailsObject(value: unknown): MediaProbeDetailObject | null {
  return isRecord(value) ? (value as MediaProbeDetailObject) : null
}

function summarizeVideoStream(stream: MediaProbeDetailObject | null): MediaVideoMetadata | null {
  if (!stream) {
    return null
  }

  const codecInfo = parseCodecToken(toText(stream.codec_name) ?? '')
  return {
    codec: codecInfo.codec,
    profile: toText(stream.profile),
    width: toNumber(stream.width),
    height: toNumber(stream.height),
    frameRate: parseFractionToNumber(stream.avg_frame_rate) ?? parseFractionToNumber(stream.r_frame_rate),
    displayAspectRatio: toText(stream.display_aspect_ratio),
    bitRateKbps: parseBitRateKbps(stream.bit_rate)
  }
}

function summarizeAudioStream(stream: MediaProbeDetailObject | null): MediaAudioMetadata | null {
  if (!stream) {
    return null
  }

  const codecInfo = parseCodecToken(toText(stream.codec_name) ?? '')
  return {
    codec: codecInfo.codec,
    profile: toText(stream.profile),
    channelLayout: toText(stream.channel_layout),
    sampleRateHz: toNumber(stream.sample_rate),
    bitRateKbps: parseBitRateKbps(stream.bit_rate)
  }
}

export function parseMediaProbeOutput(output: string): ProbeSummary {
  const normalizedOutput = output.replace(/\r\n/g, '\n')
  const lines = normalizedOutput.split('\n')

  const durationLine = lines.find((line) => /Duration:/i.test(line)) ?? null
  const videoLine = lines.find((line) => /\bVideo:/i.test(line)) ?? null
  const audioLine = lines.find((line) => /\bAudio:/i.test(line)) ?? null
  const durationSeconds = durationLine ? parseClockTimeToSeconds(/Duration:\s*([^,]+)/i.exec(durationLine)?.[1] ?? '') : null
  const overallBitrateMatch = durationLine ? /bitrate:\s*(\d+(?:\.\d+)?)\s*kb\/s/i.exec(durationLine) : null

  return {
    durationSeconds: Number.isFinite(durationSeconds ?? Number.NaN) ? durationSeconds : null,
    overallBitrateKbps: overallBitrateMatch ? Number(overallBitrateMatch[1]) : null,
    video: videoLine ? parseVideoStreamLine(videoLine) : null,
    audio: audioLine ? parseAudioStreamLine(audioLine) : null
  }
}

export function parseFfprobeOutput(output: string): FfprobeProbe | null {
  const normalizedOutput = output.trim()
  if (!normalizedOutput) {
    return null
  }

  let parsed: unknown
  try {
    parsed = JSON.parse(normalizedOutput)
  } catch {
    return null
  }

  if (!isRecord(parsed)) {
    return null
  }

  const format = normalizeDetailsObject(parsed.format)
  const streams = Array.isArray(parsed.streams)
    ? parsed.streams.map((stream) => normalizeDetailsObject(stream)).filter((stream): stream is MediaProbeDetailObject => Boolean(stream))
    : []

  const details: MediaProbeDetails = {
    format,
    streams
  }

  const videoStream = streams.find((stream) => toText(stream.codec_type) === 'video') ?? null
  const audioStream = streams.find((stream) => toText(stream.codec_type) === 'audio') ?? null

  return {
    durationSeconds: parseNumberField(format?.duration),
    overallBitrateKbps: parseBitRateKbps(format?.bit_rate),
    video: summarizeVideoStream(videoStream),
    audio: summarizeAudioStream(audioStream),
    details
  }
}

function parseNumberField(value: unknown): number | null {
  const parsed = toNumber(value)
  if (parsed != null) {
    return parsed
  }

  if (typeof value === 'string') {
    const durationSeconds = parseClockTimeToSeconds(value)
    if (durationSeconds != null) {
      return durationSeconds
    }
  }

  return null
}

async function getFfprobePath(resourcePath: string, env: NodeJS.ProcessEnv): Promise<string | null> {
  if (!cachedFfprobePathPromise) {
    cachedFfprobePathPromise = resolveFfprobePath(resourcePath, env, undefined)
  }

  return cachedFfprobePathPromise
}

async function getFfmpegPath(resourcePath: string, env: NodeJS.ProcessEnv): Promise<string | null> {
  if (!cachedFfmpegPathPromise) {
    cachedFfmpegPathPromise = resolveFfmpegPath(resourcePath, env, undefined)
  }

  return cachedFfmpegPathPromise
}

async function readProbeOutput(
  binaryPath: string,
  args: string[],
  outputChannel: 'stdout' | 'stderr',
  timeoutMs: number,
  maxBufferBytes: number
): Promise<string> {
  try {
    const result = await execFileAsync(binaryPath, args, {
      timeout: timeoutMs,
      maxBuffer: maxBufferBytes,
      windowsHide: true
    })

    return outputChannel === 'stdout' ? String(result.stdout ?? '') : String(result.stderr ?? '')
  } catch (error) {
    if (error && typeof error === 'object' && outputChannel in error) {
      return String((error as { stdout?: unknown; stderr?: unknown })[outputChannel] ?? '')
    }

    return ''
  }
}

async function readFfprobeOutput(ffprobePath: string, filePath: string): Promise<string> {
  return readProbeOutput(
    ffprobePath,
    ['-v', 'quiet', '-print_format', 'json', '-show_format', '-show_streams', filePath],
    'stdout',
    FFPROBE_TIMEOUT_MS,
    FFPROBE_MAX_BUFFER_BYTES
  )
}

async function readFfmpegOutput(ffmpegPath: string, filePath: string): Promise<string> {
  return readProbeOutput(ffmpegPath, ['-hide_banner', '-i', filePath], 'stderr', FFMPEG_TIMEOUT_MS, FFMPEG_MAX_BUFFER_BYTES)
}

export async function createMediaProbeMetadata(
  filePath: string,
  options: {
    resourcePath: string
    env?: NodeJS.ProcessEnv
  }
): Promise<MediaProbeMetadata | null> {
  if (!existsSync(filePath)) {
    return null
  }

  const fileStat = await stat(filePath)
  const ffprobePath = await getFfprobePath(options.resourcePath, options.env ?? process.env)

  if (ffprobePath) {
    const output = await readFfprobeOutput(ffprobePath, filePath)
    const probe = parseFfprobeOutput(output)

    if (probe) {
      return {
        fileSizeBytes: fileStat.size,
        probeSource: 'ffprobe',
        ...probe
      }
    }
  }

  const ffmpegPath = await getFfmpegPath(options.resourcePath, options.env ?? process.env)

  if (ffmpegPath) {
    const output = await readFfmpegOutput(ffmpegPath, filePath)
    const probe = parseMediaProbeOutput(output)

    return {
      fileSizeBytes: fileStat.size,
      probeSource: 'ffmpeg',
      details: null,
      ...probe
    }
  }

  return {
    fileSizeBytes: fileStat.size,
    durationSeconds: null,
    overallBitrateKbps: null,
    video: null,
    audio: null,
    probeSource: null,
    details: null
  }
}
