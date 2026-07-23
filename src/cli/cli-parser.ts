export type CliGlobalOptions = {
  json: boolean
  quiet: boolean
  color: boolean
}

export type CliOptionValue = string | true

export type ParsedCliArgs = {
  command: string
  positionals: string[]
  options: Map<string, CliOptionValue>
  global: CliGlobalOptions
}

function addOption(options: Map<string, CliOptionValue>, key: string, value: CliOptionValue): void {
  options.set(key, value)
}

export function parseCliArgs(args: readonly string[]): ParsedCliArgs {
  const global: CliGlobalOptions = {
    json: false,
    quiet: false,
    color: true
  }
  const commandTokens: string[] = []

  for (const arg of args) {
    if (arg === '--json') {
      global.json = true
      continue
    }
    if (arg === '--quiet' || arg === '-q') {
      global.quiet = true
      continue
    }
    if (arg === '--no-color') {
      global.color = false
      continue
    }
    commandTokens.push(arg)
  }

  const command = commandTokens.shift() ?? 'help'
  const positionals: string[] = []
  const options = new Map<string, CliOptionValue>()

  for (let index = 0; index < commandTokens.length; index += 1) {
    const token = commandTokens[index]
    if (!token?.startsWith('--')) {
      positionals.push(token ?? '')
      continue
    }

    const equalsIndex = token.indexOf('=')
    if (equalsIndex > 2) {
      addOption(options, token.slice(2, equalsIndex), token.slice(equalsIndex + 1))
      continue
    }

    const key = token.slice(2)
    const next = commandTokens[index + 1]
    if (next && !next.startsWith('-')) {
      addOption(options, key, next)
      index += 1
    } else {
      addOption(options, key, true)
    }
  }

  return { command, positionals, options, global }
}

export function getCliOption(parsed: ParsedCliArgs, key: string): string | undefined {
  const value = parsed.options.get(key)
  return typeof value === 'string' ? value : undefined
}

export function hasCliOption(parsed: ParsedCliArgs, key: string): boolean {
  return parsed.options.has(key)
}
