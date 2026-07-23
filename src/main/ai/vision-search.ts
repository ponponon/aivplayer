export type VisionLexicalMatch = {
  score: number
  matchedText: string
  source: 'subtitle' | 'filename' | 'both'
}

function normalizeSearchText(value: string): string {
  return value
    .toLocaleLowerCase()
    .replace(/[\u0000-\u001f]/g, ' ')
    .replace(/[\p{P}\p{S}]+/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function tokenizeSearchText(value: string): string[] {
  const normalized = normalizeSearchText(value)
  const tokens = new Set<string>(normalized.match(/[a-z0-9]+/g) ?? [])
  const hanCharacters = Array.from(normalized).filter((character) => /[\u3400-\u9fff]/u.test(character))
  for (const character of hanCharacters) tokens.add(character)
  for (let index = 0; index < hanCharacters.length - 1; index += 1) {
    tokens.add(`${hanCharacters[index]}${hanCharacters[index + 1]}`)
  }
  return [...tokens]
}

function scoreTextField(query: string, value: string): number {
  const normalizedQuery = normalizeSearchText(query)
  const normalizedValue = normalizeSearchText(value)
  if (!normalizedQuery || !normalizedValue) return 0
  const queryTokens = tokenizeSearchText(normalizedQuery)
  if (queryTokens.length === 0) return 0
  const matchedTokens = queryTokens.filter((token) => normalizedValue.includes(token)).length
  const tokenCoverage = matchedTokens / queryTokens.length
  const exactPhraseBonus = normalizedValue.includes(normalizedQuery) ? 0.6 : 0
  return Math.min(1, exactPhraseBonus + tokenCoverage * 0.4)
}

export function calculateVisionLexicalMatch(query: string, subtitleText: string, fileName: string): VisionLexicalMatch | null {
  const subtitleScore = scoreTextField(query, subtitleText)
  const fileNameScore = scoreTextField(query, fileName)
  if (subtitleScore <= 0 && fileNameScore <= 0) return null
  if (subtitleScore > 0 && fileNameScore > 0) {
    return {
      score: Math.min(1, Math.max(subtitleScore, fileNameScore) + Math.min(subtitleScore, fileNameScore) * 0.15),
      matchedText: subtitleText.trim() || fileName,
      source: 'both'
    }
  }
  return subtitleScore > fileNameScore
    ? { score: subtitleScore, matchedText: subtitleText.trim(), source: 'subtitle' }
    : { score: fileNameScore, matchedText: fileName, source: 'filename' }
}

export function combineVisionHybridScore(visualRankScore: number, lexicalScore: number): number {
  const visual = Math.min(1, Math.max(0, visualRankScore))
  const lexical = Math.min(1, Math.max(0, lexicalScore))
  return visual * 0.55 + lexical * 0.45
}
