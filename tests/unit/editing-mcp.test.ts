import { describe, expect, it } from 'vitest'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createEditingProject } from '../../src/core/editing/project'
import { serializeEditingProject } from '../../src/core/editing/project-file'
import { handleEditingMcpRequest, resolveEditingMcpProjectPath, type EditingMcpResponse } from '../../src/cli/editing-mcp'
import type { EditingSource } from '../../src/shared/editing-types'

const source: EditingSource = {
  id: 'source-main',
  path: '/videos/interview.mp4',
  name: 'interview.mp4',
  fingerprint: '/videos/interview.mp4:20',
  durationSeconds: 20,
  width: 1920,
  height: 1080
}

function responseResult(response: EditingMcpResponse | null): Record<string, unknown> {
  expect(response).not.toBeNull()
  expect(response?.error).toBeUndefined()
  return response?.result as Record<string, unknown>
}

function toolPayload(response: EditingMcpResponse | null): Record<string, unknown> {
  const result = responseResult(response)
  const content = result.content as Array<{ type: string; text: string }>
  expect(content[0]?.type).toBe('text')
  return JSON.parse(content[0]?.text ?? '{}') as Record<string, unknown>
}

describe('aivplayer editing MCP stdio contract', () => {
  it('negotiates MCP, lists only the read-only editing tools, and ignores notifications', async () => {
    const options = { projectPath: '/tmp/project.aivproj', version: '0.5.0' }
    const initialized = await handleEditingMcpRequest({ jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2025-03-26' } }, options)
    expect(responseResult(initialized)).toMatchObject({ protocolVersion: '2025-03-26', serverInfo: { name: 'aivplayer-editing', version: '0.5.0' } })

    const listed = await handleEditingMcpRequest({ jsonrpc: '2.0', id: 2, method: 'tools/list' }, options)
    const tools = (responseResult(listed).tools as Array<{ name: string }>).map((tool) => tool.name)
    expect(tools).toEqual(['editing_project_inspect', 'editing_project_captions', 'editing_project_propose_delete_script'])
    expect(tools).not.toContain('editing_project_apply')
    await expect(handleEditingMcpRequest({ jsonrpc: '2.0', method: 'notifications/initialized' }, options)).resolves.toBeNull()

    const unsupported = await handleEditingMcpRequest({ jsonrpc: '2.0', id: 3, method: 'resources/list' }, options)
    expect(unsupported?.error).toMatchObject({ code: -32601 })
  })

  it('pins all tools to one project and keeps inspect, captions, and proposal read-only', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'aivplayer-mcp-'))
    const projectPath = join(directory, 'project.aivproj')
    try {
      const project = createEditingProject(source, { projectId: 'project-mcp', clipId: 'clip-main', now: 123 })
      const persisted = {
        ...project,
        videoClips: [{ ...project.videoClips[0]!, sourceStartSeconds: 0, sourceEndSeconds: 20 }],
        captions: [
          { id: 'caption-1', sourceId: source.id, sourceStartSeconds: 1, sourceEndSeconds: 3, startSeconds: 1, durationSeconds: 2, text: '保留这一段', kind: 'source' as const },
          { id: 'caption-2', sourceId: source.id, sourceStartSeconds: 3, sourceEndSeconds: 5, startSeconds: 3, durationSeconds: 2, text: '删除这一段', kind: 'source' as const }
        ],
        scriptSegments: [
          { id: 'script-1', sourceId: source.id, sourceStartSeconds: 1, sourceEndSeconds: 3, text: '保留这一段' },
          { id: 'script-2', sourceId: source.id, sourceStartSeconds: 3, sourceEndSeconds: 5, text: '删除这一段', translationText: 'Delete this part' }
        ]
      }
      await writeFile(projectPath, serializeEditingProject(persisted), 'utf8')
      const options = { projectPath, version: '0.5.0' }

      const inspected = toolPayload(await handleEditingMcpRequest({ jsonrpc: '2.0', id: 4, method: 'tools/call', params: { name: 'editing_project_inspect' } }, options))
      expect(inspected).toMatchObject({ ok: true, projectPath, project: { id: 'project-mcp', script: { total: 2 } } })

      const captions = toolPayload(await handleEditingMcpRequest({ jsonrpc: '2.0', id: 5, method: 'tools/call', params: { name: 'editing_project_captions', arguments: { query: 'delete', limit: 10 } } }, options))
      expect(captions).toMatchObject({ ok: true, projectPath, totalMatches: 1 })

      const proposal = toolPayload(await handleEditingMcpRequest({ jsonrpc: '2.0', id: 6, method: 'tools/call', params: { name: 'editing_project_propose_delete_script', arguments: { segmentIds: ['script-1', 'script-2'] } } }, options))
      expect(proposal).toMatchObject({ ok: true, projectPath, proposal: { base: { projectId: 'project-mcp' }, diff: { scriptSegments: [{ id: 'script-1' }, { id: 'script-2' }] } } })

      const unknownTool = await handleEditingMcpRequest({ jsonrpc: '2.0', id: 7, method: 'tools/call', params: { name: 'editing_project_apply', arguments: {} } }, options)
      expect(unknownTool?.result).toMatchObject({ isError: true })
      expect(await handleEditingMcpRequest({ jsonrpc: '2.0', id: 8, method: 'tools/call', params: { name: 'editing_project_propose_delete_script', arguments: { segmentIds: ['script-1', 'script-1'] } } }, options)).toMatchObject({ result: { isError: true } })
    } finally {
      await rm(directory, { recursive: true, force: true })
    }
  })

  it('rejects non-project MCP targets before starting the server', () => {
    expect(() => resolveEditingMcpProjectPath('/tmp/project.json')).toThrow('MCP 只接受 .aivproj 工程文件')
  })

  it('forwards a desktop-mode Proposal to the confirmation bridge and returns its decision', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'aivplayer-mcp-bridge-'))
    const projectPath = join(directory, 'project.aivproj')
    try {
      const project = createEditingProject(source, { projectId: 'project-mcp-bridge', clipId: 'clip-main', now: 123 })
      const persisted = {
        ...project,
        videoClips: [{ ...project.videoClips[0]!, sourceStartSeconds: 0, sourceEndSeconds: 20 }],
        scriptSegments: [{ id: 'script-bridge', sourceId: source.id, sourceStartSeconds: 3, sourceEndSeconds: 5, text: '删除这一段' }]
      }
      await writeFile(projectPath, serializeEditingProject(persisted), 'utf8')
      let receivedProjectPath = ''
      const decision = { outcome: 'applied' as const, message: '已由桌面端确认' }
      const options = {
        projectPath,
        version: '0.5.0',
        proposalSink: async (request: { projectPath: string }): Promise<typeof decision> => {
          receivedProjectPath = request.projectPath
          return decision
        }
      }

      const response = await handleEditingMcpRequest({ jsonrpc: '2.0', id: 9, method: 'tools/call', params: { name: 'editing_project_propose_delete_script', arguments: { segmentIds: ['script-bridge'] } } }, options)
      expect(receivedProjectPath).toBe(projectPath)
      expect(toolPayload(response)).toMatchObject({ ok: true, decision })
    } finally {
      await rm(directory, { recursive: true, force: true })
    }
  })
})
