import { spawn } from 'node:child_process'
import { once } from 'node:events'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createRequire } from 'node:module'

type McpClientConfig = {
  mcpServers?: Record<string, { command?: string; args?: string[] }>
}

const require = createRequire(import.meta.url)
const electronPath = require('electron') as string

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message)
}

async function main(): Promise<void> {
  const directory = await mkdtemp(join(tmpdir(), 'aivplayer-smoke-editing-mcp-config-'))
  const userDataDirectory = join(directory, 'user-data')
  const projectPath = join(directory, 'mcp project.aivproj')
  const child = spawn(electronPath, [
    '--no-sandbox',
    '--in-process-gpu',
    `--user-data-dir=${userDataDirectory}`,
    join(process.cwd(), 'out/main/index.js'),
    '--cli',
    'mcp',
    'config',
    projectPath,
    '--command',
    '/opt/aivcli',
    '--desktop'
  ], {
    env: { ...process.env, HOME: directory, AIVPLAYER_DISABLE_GPU: '1' },
    stdio: ['ignore', 'pipe', 'pipe']
  })

  const stdout: Buffer[] = []
  const stderr: Buffer[] = []
  child.stdout.on('data', (chunk: Buffer) => stdout.push(chunk))
  child.stderr.on('data', (chunk: Buffer) => stderr.push(chunk))

  try {
    const [exitCode] = await once(child, 'close') as [number | null]
    assert(exitCode === 0, `aivcli mcp config 退出码异常：${String(exitCode)}，stderr：${Buffer.concat(stderr).toString('utf8')}`)
    const config = JSON.parse(Buffer.concat(stdout).toString('utf8')) as McpClientConfig
    const server = config.mcpServers?.['aivplayer-editing']
    assert(server?.command === '/opt/aivcli', 'MCP 配置没有保留自定义命令')
    assert(JSON.stringify(server.args) === JSON.stringify(['mcp', 'serve', projectPath, '--desktop']), 'MCP 配置参数未固定到目标工程或桌面桥接开关')
    console.log(JSON.stringify({ ok: true, command: server.command, args: server.args }))
  } finally {
    if (!child.killed && child.exitCode === null) child.kill()
    await rm(directory, { recursive: true, force: true })
  }
}

await main()
