export const minSubtitleFontSize = 12
export const maxSubtitleFontSize = 28

export function clampSubtitleFontSize(value: number): number {
  return Math.min(maxSubtitleFontSize, Math.max(minSubtitleFontSize, Math.round(value)))
}
