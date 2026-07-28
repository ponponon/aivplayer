function isJpeg(buffer: Buffer): boolean {
  return buffer.length >= 2 && buffer[0] === 0xff && buffer[1] === 0xd8
}

function isApplicationMarker(marker: number): boolean {
  return marker >= 0xe0 && marker <= 0xef
}

function readSegmentLength(buffer: Buffer, offset: number): number | null {
  if (offset + 2 > buffer.length) return null
  const length = buffer.readUInt16BE(offset)
  return length >= 2 ? length : null
}

function readJpegMarker(buffer: Buffer, offset: number): { marker: number; nextOffset: number } | null {
  if (buffer[offset] !== 0xff) return null
  let nextOffset = offset + 1
  while (nextOffset < buffer.length && buffer[nextOffset] === 0xff) nextOffset += 1
  if (nextOffset >= buffer.length) return null
  return { marker: buffer[nextOffset], nextOffset: nextOffset + 1 }
}

function collectOriginalAppSegments(originalJpeg: Buffer): Buffer[] {
  if (!isJpeg(originalJpeg)) return []
  const segments: Buffer[] = []
  let offset = 2
  while (offset < originalJpeg.length) {
    const markerInfo = readJpegMarker(originalJpeg, offset)
    if (!markerInfo) break
    const { marker, nextOffset } = markerInfo
    if (marker === 0xda || marker === 0xd9) break
    if (marker === 0xd8 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) {
      offset = nextOffset
      continue
    }
    const length = readSegmentLength(originalJpeg, nextOffset)
    if (length === null || nextOffset + length > originalJpeg.length) break
    const segmentEnd = nextOffset + length
    if (isApplicationMarker(marker)) segments.push(originalJpeg.subarray(offset, segmentEnd))
    offset = segmentEnd
  }
  return segments
}

function stripRenderedAppSegments(renderedJpeg: Buffer): Buffer | null {
  if (!isJpeg(renderedJpeg)) return null
  const parts: Buffer[] = [renderedJpeg.subarray(0, 2)]
  let offset = 2
  while (offset < renderedJpeg.length) {
    const markerInfo = readJpegMarker(renderedJpeg, offset)
    if (!markerInfo) return null
    const { marker, nextOffset } = markerInfo
    if (marker === 0xd9) {
      parts.push(renderedJpeg.subarray(offset, nextOffset))
      return Buffer.concat(parts)
    }
    if (marker === 0xda) {
      const length = readSegmentLength(renderedJpeg, nextOffset)
      if (length === null || nextOffset + length > renderedJpeg.length) return null
      parts.push(renderedJpeg.subarray(offset))
      return Buffer.concat(parts)
    }
    if (marker === 0xd8 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) {
      parts.push(renderedJpeg.subarray(offset, nextOffset))
      offset = nextOffset
      continue
    }
    const length = readSegmentLength(renderedJpeg, nextOffset)
    if (length === null || nextOffset + length > renderedJpeg.length) return null
    const segmentEnd = nextOffset + length
    if (!isApplicationMarker(marker)) parts.push(renderedJpeg.subarray(offset, segmentEnd))
    offset = segmentEnd
  }
  return null
}

export function mergeJpegCoverMetadata(originalJpeg: Buffer, renderedJpeg: Buffer): Buffer {
  const renderedWithoutApps = stripRenderedAppSegments(renderedJpeg)
  if (!renderedWithoutApps || !isJpeg(originalJpeg)) return renderedJpeg
  const originalApps = collectOriginalAppSegments(originalJpeg)
  return Buffer.concat([renderedWithoutApps.subarray(0, 2), ...originalApps, renderedWithoutApps.subarray(2)])
}

