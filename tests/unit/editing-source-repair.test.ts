import { describe, expect, it } from 'vitest'
import { createEditingProject } from '../../src/core/editing/project'
import { matchEditingSourceRepairCandidates, relinkEditingProjectSources } from '../../src/core/editing/source-repair'
import type { EditingSource } from '../../src/shared/editing-types'

const firstSource: EditingSource = { id: 'source-first', path: '/old/first.mp4', name: 'first.mp4', fingerprint: '/old/first.mp4:10', durationSeconds: 10 }
const secondSource: EditingSource = { id: 'source-second', path: '/old/second.mp4', name: 'second.mp4', fingerprint: '/old/second.mp4:20', durationSeconds: 20 }

describe('editing source repair', () => {
  it('matches moved sources by name and duration instead of source array order', () => {
    const result = matchEditingSourceRepairCandidates([firstSource, secondSource], [
      { path: '/new/second.mp4', name: 'second.mp4', durationSeconds: 20 },
      { path: '/new/first.mp4', name: 'first.mp4', durationSeconds: 10 }
    ])

    expect(result.unresolvedSourceIds).toEqual([])
    expect(result.ambiguousSourceIds).toEqual([])
    expect(result.replacements).toMatchObject([
      { sourceId: firstSource.id, path: '/new/first.mp4' },
      { sourceId: secondSource.id, path: '/new/second.mp4' }
    ])
  })

  it('does not guess when duplicate candidates are indistinguishable', () => {
    const result = matchEditingSourceRepairCandidates([firstSource], [
      { path: '/new/a/first.mp4', name: 'first.mp4', durationSeconds: 10 },
      { path: '/new/b/first.mp4', name: 'first.mp4', durationSeconds: 10 }
    ])

    expect(result.replacements).toEqual([])
    expect(result.ambiguousSourceIds).toEqual([firstSource.id])
    expect(result.ambiguous).toEqual([{ sourceId: firstSource.id, sourceName: firstSource.name, candidatePaths: ['/new/a/first.mp4', '/new/b/first.mp4'] }])
  })

  it('keeps an explicit unresolved issue when no candidate is usable', () => {
    const result = matchEditingSourceRepairCandidates([firstSource], [
      { path: '/new/other.mp4', name: 'other.mp4', durationSeconds: 5 }
    ])

    expect(result.unresolvedSourceIds).toEqual([firstSource.id])
    expect(result.unresolved).toEqual([{ sourceId: firstSource.id, sourceName: firstSource.name, candidatePaths: [] }])
  })

  it('relinks paths while preserving source IDs and timeline references', () => {
    const project = { ...createEditingProject(firstSource, { now: 100 }), sources: [firstSource, secondSource], videoClips: [{ ...createEditingProject(firstSource).videoClips[0]!, sourceId: secondSource.id, sourceEndSeconds: 18 }] }
    const repaired = relinkEditingProjectSources(project, [{ sourceId: firstSource.id, path: '/new/first.mp4', name: 'first.mp4', durationSeconds: 10 }], 200)

    expect(repaired).toMatchObject({ updatedAt: 200, videoClips: [{ sourceId: secondSource.id }] })
    expect(repaired?.sources).toEqual([{ ...firstSource, path: '/new/first.mp4', fingerprint: '/new/first.mp4:10' }, secondSource])
    expect(relinkedSource(repaired, firstSource.id)).toMatchObject({ id: firstSource.id, path: '/new/first.mp4', fingerprint: '/new/first.mp4:10' })
  })

  it('rejects a replacement that cannot contain the existing source range', () => {
    const project = createEditingProject(firstSource)
    expect(relinkEditingProjectSources(project, [{ sourceId: firstSource.id, path: '/new/short.mp4', name: 'short.mp4', durationSeconds: 5 }], 200)).toBeNull()
  })
})

function relinkedSource(project: ReturnType<typeof relinkEditingProjectSources>, sourceId: string): EditingSource | undefined {
  return project?.sources.find((source) => source.id === sourceId)
}
