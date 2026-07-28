import { extname } from 'node:path'

export type EmbeddedMotionPhotoFormat = 'xiaomi' | 'google-motion-photo'

export type ParsedEmbeddedMotionPhoto = {
  format: EmbeddedMotionPhotoFormat
  imageEndOffset: number
  motionOffset: number
  motionBytes: Buffer
  metadataVersion?: number
  metadataSummary?: string
  videoPresentationTimestampUs?: number
}

const MP4_BRANDS = new Set(['isom', 'iso2', 'iso3', 'iso4', 'iso5', 'iso6', 'mp41', 'mp42', 'avc1', 'hvc1', 'heic', 'M4V '])

function isJpeg(buffer: Buffer): boolean {
  return buffer.length >= 2 && buffer[0] === 0xff && buffer[1] === 0xd8
}

function readSegmentLength(buffer: Buffer, offset: number): number | null {
  if (offset + 2 > buffer.length) return null
  const length = buffer.readUInt16BE(offset)
  return length >= 2 ? length : null
}

function findJpegEnd(buffer: Buffer): number | null {
  if (!isJpeg(buffer)) return null
  let offset = 2
  while (offset < buffer.length) {
    if (buffer[offset] !== 0xff) {
      offset += 1
      continue
    }
    while (offset < buffer.length && buffer[offset] === 0xff) offset += 1
    if (offset >= buffer.length) return null
    const marker = buffer[offset]
    offset += 1
    if (marker === 0xd9) return offset
    if (marker === 0xda) {
      for (let scanOffset = offset; scanOffset + 1 < buffer.length; scanOffset += 1) {
        if (buffer[scanOffset] !== 0xff) continue
        const next = buffer[scanOffset + 1]
        if (next === 0x00 || (next >= 0xd0 && next <= 0xd7)) {
          scanOffset += 1
          continue
        }
        if (next === 0xd9) return scanOffset + 2
      }
      return null
    }
    if (marker === 0xd8 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) continue
    const segmentLength = readSegmentLength(buffer, offset)
    if (segmentLength === null) return null
    offset += segmentLength
  }
  return null
}

function readAscii(buffer: Buffer, start: number, length: number): string {
  return buffer.subarray(start, Math.min(buffer.length, start + length)).toString('latin1')
}

function isMp4Ftyp(buffer: Buffer, ftypOffset: number): boolean {
  if (ftypOffset < 4 || readAscii(buffer, ftypOffset, 4) !== 'ftyp') return false
  const boxStart = ftypOffset - 4
  const boxSize = buffer.readUInt32BE(boxStart)
  if (boxSize !== 0 && (boxSize < 16 || boxStart + boxSize > buffer.length)) return false
  const majorBrand = readAscii(buffer, ftypOffset + 4, 4).trim()
  if (MP4_BRANDS.has(majorBrand)) return true
  for (let offset = ftypOffset + 12; offset + 4 <= Math.min(buffer.length, ftypOffset + 64); offset += 4) {
    if (MP4_BRANDS.has(readAscii(buffer, offset, 4).trim())) return true
  }
  return false
}

function findMp4Start(buffer: Buffer, startOffset: number): number | null {
  for (let offset = Math.max(4, startOffset); offset + 4 <= buffer.length; offset += 1) {
    if (buffer[offset] !== 0x66 || buffer[offset + 1] !== 0x74 || buffer[offset + 2] !== 0x79 || buffer[offset + 3] !== 0x70) continue
    if (isMp4Ftyp(buffer, offset)) return offset - 4
  }
  return null
}

function findAppendedMotionStart(buffer: Buffer, sourcePath: string, jpegEnd: number | null): number | null {
  if (jpegEnd !== null) return findMp4Start(buffer, jpegEnd)
  const extension = extname(sourcePath).toLowerCase()
  if (!['.heic', '.heif', '.avif'].includes(extension)) return null
  const firstFtypOffset = buffer.indexOf(Buffer.from('ftyp', 'latin1'))
  if (firstFtypOffset < 4) return null
  const firstBoxStart = firstFtypOffset - 4
  const firstBoxSize = buffer.readUInt32BE(firstBoxStart)
  const searchOffset = firstBoxSize === 0 ? firstFtypOffset + 8 : firstBoxStart + firstBoxSize
  return findMp4Start(buffer, searchOffset)
}

function readMetadata(buffer: Buffer): { format: EmbeddedMotionPhotoFormat; version?: number; summary?: string; videoPresentationTimestampUs?: number } {
  const metadataText = buffer.toString('latin1')
  const livephotoMatch = metadataText.match(/"livephotoInfo":"([^"]+)/)
  const versionMatch = metadataText.match(/"version":(\d+)/)
  if (livephotoMatch || metadataText.includes('XIAOMI_CUSTOMIZE')) {
    const headMatch = livephotoMatch?.[1].match(/(?:^|\s)head:(\d+)/)
    const timeMatch = livephotoMatch?.[1].match(/(?:^|\s)time:(\d+)/)
    return {
      format: 'xiaomi',
      version: versionMatch ? Number(versionMatch[1]) : undefined,
      summary: livephotoMatch?.[1],
      videoPresentationTimestampUs: headMatch && timeMatch ? Math.max(0, Number(timeMatch[1]) - Number(headMatch[1])) : undefined
    }
  }
  return { format: 'google-motion-photo' }
}

export function parseEmbeddedMotionPhoto(buffer: Buffer, sourcePath = ''): ParsedEmbeddedMotionPhoto | null {
  const jpegEnd = findJpegEnd(buffer)
  const motionOffset = findAppendedMotionStart(buffer, sourcePath, jpegEnd)
  if (motionOffset === null || motionOffset <= jpegEnd || motionOffset >= buffer.length) return null
  const metadata = readMetadata(buffer.subarray(0, motionOffset))
  const extension = extname(sourcePath).toLowerCase()
  if (metadata.format === 'google-motion-photo' && extension !== '.jpg' && extension !== '.jpeg' && !buffer.includes(Buffer.from('GCamera'))) return null
  return {
    format: metadata.format,
    imageEndOffset: motionOffset,
    motionOffset,
    motionBytes: buffer.subarray(motionOffset),
    metadataVersion: metadata.version,
    metadataSummary: metadata.summary,
    videoPresentationTimestampUs: metadata.videoPresentationTimestampUs
  }
}

export function replaceGoogleMotionPhotoVideoLength(imageBytes: Buffer, motionLength: number): Buffer {
  const source = imageBytes.toString('latin1')
  const pattern = /(Container:Item[^>]*?Length=")\d+(")/g
  const matches = Array.from(source.matchAll(pattern))
  if (matches.length > 0) {
    const last = matches[matches.length - 1]
    const start = last.index ?? -1
    if (start >= 0) {
      const matchText = last[0]
      const replacement = matchText.replace(/\d+(?=")/, (digits) => String(motionLength).padStart(digits.length, '0'))
      return Buffer.from(`${source.slice(0, start)}${replacement}${source.slice(start + matchText.length)}`, 'latin1')
    }
  }
  const legacyPattern = /((?:GCamera:)?MicroVideoOffset(?:="|:))\d+/g
  const legacyMatches = Array.from(source.matchAll(legacyPattern))
  if (legacyMatches.length === 0) return imageBytes
  const lastLegacy = legacyMatches[legacyMatches.length - 1]
  const legacyStart = lastLegacy.index ?? -1
  if (legacyStart < 0) return imageBytes
  const legacyText = lastLegacy[0]
  const legacyReplacement = legacyText.replace(/\d+$/, (digits) => String(motionLength).padStart(digits.length, '0'))
  return Buffer.from(`${source.slice(0, legacyStart)}${legacyReplacement}${source.slice(legacyStart + legacyText.length)}`, 'latin1')
}

export function updateXiaomiLivePhotoTimeline(imageBytes: Buffer, startSeconds: number, durationSeconds: number): Buffer {
  const source = imageBytes.toString('latin1')
  const infoMatch = source.match(/("livephotoInfo":")([^"]+)/)
  if (!infoMatch || infoMatch.index === undefined) return imageBytes
  const infoStart = infoMatch.index + infoMatch[1].length
  const info = infoMatch[2]
  const headMatch = info.match(/(?:^|\s)head:(\d+)/)
  const timeMatch = info.match(/(?:^|\s)time:(\d+)/)
  if (!headMatch || !timeMatch) return imageBytes
  const presentationUs = Math.max(0, Number(timeMatch[1]) - Number(headMatch[1]) - Math.round(Math.max(0, startSeconds) * 1_000_000))
  const durationUs = Math.max(100_000, Math.round(Math.max(0.1, durationSeconds) * 1_000_000))
  const replaceTimelineField = (value: string, field: string, nextValue: number): string => value.replace(new RegExp(`(${field}:)(\\d+)`), (_match, prefix: string, digits: string) => `${prefix}${String(nextValue).padStart(digits.length, '0')}`)
  let nextInfo = replaceTimelineField(info, 'head', 0)
  nextInfo = replaceTimelineField(nextInfo, 'time', presentationUs)
  nextInfo = replaceTimelineField(nextInfo, 'tail', durationUs)
  return Buffer.from(`${source.slice(0, infoStart)}${nextInfo}${source.slice(infoStart + info.length)}`, 'latin1')
}
