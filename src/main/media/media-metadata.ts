import { existsSync } from 'node:fs'
import { stat } from 'node:fs/promises'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { resolveFfmpegPath } from '../ai/whisper-cpp-runtime'
import type { MediaAudioMetadata, MediaProbeMetadata, MediaVideoMetadata } from '../../shared/media-types'

const execFileAsync = promisify(execFile)
const PROBE_TIMEOUT_MS = 6000
const PROBE_MAX_BUFFER_BYTES = 1024 * 1024

let cachedFfmpegPathPromise: Promise<string | null> | null = null

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

function parseVideoStream(line: string): MediaVideoMetadata | null {
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

function parseAudioStream(line: string): MediaAudioMetadata | null {
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

export function parseMediaProbeOutput(output: string): Omit<MediaProbeMetadata, 'fileSizeBytes'> {
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
    video: videoLine ? parseVideoStream(videoLine) : null,
    audio: audioLine ? parseAudioStream(audioLine) : null
  }
}

async function getFfmpegPath(resourcePath: string, env: NodeJS.ProcessEnv): Promise<string | null> {
  if (!cachedFfmpegPathPromise) {
    cachedFfmpegPathPromise = resolveFfmpegPath(resourcePath, env, undefined)
  }

  return cachedFfmpegPathPromise
}

async function readProbeOutput(ffmpegPath: string, filePath: string): Promise<string> {
  try {
    await execFileAsync(ffmpegPath, ['-hide_banner', '-i', filePath], {
      timeout: PROBE_TIMEOUT_MS,
      maxBuffer: PROBE_MAX_BUFFER_BYTES,
      windowsHide: true
    })
    return ''
  } catch (error) {
    if (error && typeof error === 'object' && 'stderr' in error) {
      return String((error as { stderr?: unknown }).stderr ?? '')
    }

    return ''
  }
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
  const ffmpegPath = await getFfmpegPath(options.resourcePath, options.env ?? process.env)

  if (!ffmpegPath) {
    return {
      fileSizeBytes: fileStat.size,
      durationSeconds: null,
      overallBitrateKbps: null,
      video: null,
      audio: null
    }
  }

  const output = await readProbeOutput(ffmpegPath, filePath)
  const probe = parseMediaProbeOutput(output)

  return {
    fileSizeBytes: fileStat.size,
    ...probe
  }
}
