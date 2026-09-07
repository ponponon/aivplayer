/** Validates and normalizes a complete SHA-256 media content identity. */
export function normalizeMediaContentHash(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined
  const normalized = value.trim().toLowerCase()
  return /^[a-f0-9]{64}$/.test(normalized) ? normalized : undefined
}
