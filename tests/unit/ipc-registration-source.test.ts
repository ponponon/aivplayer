import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const projectRoot = process.cwd()

function collectIpcRegistrations(): string[] {
  const mainDirectory = join(projectRoot, 'src/main')
  const ipcFiles = readdirSync(mainDirectory).filter((name) => name.startsWith('ipc-') && name.endsWith('.ts'))

  return ipcFiles.flatMap((fileName) => {
    const source = readFileSync(join(mainDirectory, fileName), 'utf8')
    return [...source.matchAll(/ipcMain\.handle\(IPC_CHANNELS\.([A-Z0-9_]+)/g)].map((match) => match[1])
  })
}

describe('main-process IPC registration', () => {
  it('registers every IPC channel at most once', () => {
    const registrations = collectIpcRegistrations()

    expect(registrations.length).toBeGreaterThan(0)
    expect(new Set(registrations).size).toBe(registrations.length)
  })
})
