export type ByteRange = {
  start: number
  end: number
  contentLength: number
}

export function parseRangeHeader(rangeHeader: string | null, fileSize: number): ByteRange | null {
  if (!rangeHeader || fileSize <= 0) {
    return null
  }

  const match = /^bytes=(\d*)-(\d*)$/.exec(rangeHeader.trim())
  if (!match) {
    return null
  }

  const [, rawStart, rawEnd] = match
  if (!rawStart && !rawEnd) {
    return null
  }

  let start: number
  let end: number

  if (!rawStart) {
    const suffixLength = Number(rawEnd)
    if (!Number.isSafeInteger(suffixLength) || suffixLength <= 0) {
      return null
    }
    start = Math.max(fileSize - suffixLength, 0)
    end = fileSize - 1
  } else {
    start = Number(rawStart)
    end = rawEnd ? Number(rawEnd) : fileSize - 1
    if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end)) {
      return null
    }
  }

  if (start < 0 || start >= fileSize || end < start) {
    return null
  }

  end = Math.min(end, fileSize - 1)

  return {
    start,
    end,
    contentLength: end - start + 1
  }
}
