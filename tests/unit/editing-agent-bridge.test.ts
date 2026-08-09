import { describe, expect, it } from 'vitest'
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { getEditingAgentBridgePaths, readEditingAgentBridgeManifest } from '../../src/core/editing/editing-agent-bridge'
import { EDITING_AGENT_BRIDGE_PROTOCOL } from '../../src/shared/editing-agent'

describe('editing Agent desktop bridge', () => {
  it('creates a stable manifest path and reads the bridge contract', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'aivplayer-agent-bridge-'))
    try {
      const paths = getEditingAgentBridgePaths(join(directory, 'user-data'))
      const manifest = {
        protocol: EDITING_AGENT_BRIDGE_PROTOCOL,
        socketPath: paths.socketPath,
        token: 'token-value-that-is-at-least-32-characters-long',
        pid: process.pid,
        createdAt: Date.now()
      }
      await mkdir(join(directory, 'user-data'), { recursive: true })
      await writeFile(paths.manifestPath, JSON.stringify(manifest), 'utf8')
      await expect(readEditingAgentBridgeManifest(paths.manifestPath)).resolves.toEqual(manifest)
      expect(paths.manifestPath).toContain('editing-agent-bridge.json')
      expect(paths.socketPath).toContain(process.platform === 'win32' ? '\\\\.\\pipe\\aivplayer-editing-agent-' : 'editing-agent-bridge.sock')
    } finally {
      await rm(directory, { recursive: true, force: true })
    }
  })

  it('rejects malformed manifests before attempting a socket connection', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'aivplayer-agent-bridge-invalid-'))
    try {
      const path = join(directory, 'editing-agent-bridge.json')
      await writeFile(path, JSON.stringify({ protocol: EDITING_AGENT_BRIDGE_PROTOCOL, socketPath: '/tmp/not-listening.sock', token: 'short', pid: process.pid }), 'utf8')
      await expect(readEditingAgentBridgeManifest(path)).rejects.toThrow('清单无效')
    } finally {
      await rm(directory, { recursive: true, force: true })
    }
  })
})
