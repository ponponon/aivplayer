import { describe, expect, it } from 'vitest'
import { formatEditingCaptionCandidateStatus } from '../../src/renderer/src/app/use-editing-caption-effect'
import type { EditingCaptionSourcePaths } from '../../src/renderer/src/app/editing-caption-loader'

describe('editing caption candidate status', () => {
  it('keeps the toolbar summary short and moves full paths into expandable details', () => {
    const sourcePaths: EditingCaptionSourcePaths = {
      'source-1': {
        source: {
          selectedPath: '/old-machine/projects/very-long-directory/demo.vtt',
          candidates: ['/old-machine/projects/very-long-directory/demo.vtt', '/old-machine/projects/very-long-directory/demo.VTT'],
          validCandidatePaths: ['/old-machine/projects/very-long-directory/demo.vtt'],
          equivalentCandidateGroups: [['/old-machine/projects/very-long-directory/demo.vtt', '/old-machine/projects/very-long-directory/demo.VTT']]
        },
        translation: {
          selectedPath: '/old-machine/projects/very-long-directory/demo.zh-CN.srt',
          candidates: ['/old-machine/projects/very-long-directory/demo.zh-CN.srt', '/old-machine/projects/very-long-directory/demo.zh-CN.vtt'],
          validCandidatePaths: ['/old-machine/projects/very-long-directory/demo.zh-CN.srt', '/old-machine/projects/very-long-directory/demo.zh-CN.vtt'],
          equivalentCandidateGroups: []
        }
      }
    }
    const status = formatEditingCaptionCandidateStatus({ sources: [{ id: 'source-1', path: '/old-machine/projects/very-long-directory/demo.mp4', name: 'demo.mp4', fingerprint: 'demo:1', durationSeconds: 1 }] }, sourcePaths, 'zh-CN')

    expect(status?.success).toBe(false)
    expect(status?.message).toContain('demo.vtt')
    expect(status?.message).not.toContain('/old-machine/projects/very-long-directory')
    expect(status?.details?.label).toBe('查看完整候选路径')
    expect(status?.details?.groups).toHaveLength(2)
    expect(status?.details?.groups[0]?.label).toContain('原文')
    expect(status?.details?.groups[1]?.label).toContain('译文')
    expect(status?.details?.groups.flatMap((group) => group.items).some((item) => item.includes('/old-machine/projects/very-long-directory/demo.VTT'))).toBe(true)
    expect(status?.details?.groups.flatMap((group) => group.items).some((item) => item.includes('内容不同的候选'))).toBe(true)
  })

  it('does not create details for a source with one valid path', () => {
    const sourcePaths: EditingCaptionSourcePaths = {
      'source-1': {
        source: { selectedPath: '/media/demo.vtt', candidates: ['/media/demo.vtt'], validCandidatePaths: ['/media/demo.vtt'] },
        translation: { selectedPath: null, candidates: [], validCandidatePaths: [] }
      }
    }

    expect(formatEditingCaptionCandidateStatus({ sources: [{ id: 'source-1', path: '/media/demo.mp4', name: 'demo.mp4', fingerprint: 'demo:1', durationSeconds: 1 }] }, sourcePaths, 'zh-CN')).toBeNull()
  })
})
