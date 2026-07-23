import { describe, expect, it } from 'vitest'
import { getCliOption, hasCliOption, parseCliArgs } from '../../src/cli/cli-parser'

describe('aivcli argument parser', () => {
  it('parses global flags independently of command options', () => {
    const parsed = parseCliArgs(['asr', 'movie.mp4', '--json', '--format=both', '--quiet'])

    expect(parsed.command).toBe('asr')
    expect(parsed.positionals).toEqual(['movie.mp4'])
    expect(parsed.global.json).toBe(true)
    expect(parsed.global.quiet).toBe(true)
    expect(getCliOption(parsed, 'format')).toBe('both')
  })

  it('supports boolean options and help defaults', () => {
    const parsed = parseCliArgs(['library', 'index', '--recursive', '--no-recursive'])
    const help = parseCliArgs([])

    expect(hasCliOption(parsed, 'recursive')).toBe(true)
    expect(hasCliOption(parsed, 'no-recursive')).toBe(true)
    expect(help.command).toBe('help')
  })
})
