import { describe, expect, it } from 'vitest'
import type { VisionClipCollectionTagMetadata } from '../../src/shared/vision-types'
import { getVisionCollectionTagChildren, hasVisionCollectionTagChildren, isVisionCollectionTagDescendantOrSelf, isVisionCollectionTagHiddenByCollapsedAncestor, matchesVisionCollectionTagFilter, mergeVisionClipCollectionTagCollapsePreferences, normalizeVisionClipCollectionTagCollapsePreferences, parseVisionClipCollectionTagCollapsePreferences, serializeVisionClipCollectionTagCollapsePreferences } from '../../src/core/ai/clip-inbox-tag-tree'

function metadata(tag: string, parentTag = ''): VisionClipCollectionTagMetadata {
  return { tag, parentTag, color: '', textColor: '', note: '', isFavorite: false, updatedAt: 0 }
}

describe('clip inbox tag tree', () => {
  const tree = [metadata('项目'), metadata('视频', '项目'), metadata('音频', '项目'), metadata('采访', '视频'), metadata('孤立')]

  it('returns direct children in a stable order', () => {
    expect(getVisionCollectionTagChildren('项目', tree)).toEqual(['视频', '音频'].sort((left, right) => left.localeCompare(right, undefined, { sensitivity: 'base' })))
    expect(getVisionCollectionTagChildren('孤立', tree)).toEqual([])
    expect(hasVisionCollectionTagChildren('项目', tree)).toBe(true)
    expect(hasVisionCollectionTagChildren('采访', tree)).toBe(false)
    expect(isVisionCollectionTagDescendantOrSelf('采访', '项目', tree)).toBe(true)
    expect(isVisionCollectionTagDescendantOrSelf('采访', '采访', tree)).toBe(true)
    expect(isVisionCollectionTagDescendantOrSelf('项目', '采访', tree)).toBe(false)
    expect(matchesVisionCollectionTagFilter(['采访'], ['项目'], tree, 'any')).toBe(true)
    expect(matchesVisionCollectionTagFilter(['采访', '音频'], ['项目', '音频'], tree, 'all')).toBe(true)
    expect(matchesVisionCollectionTagFilter(['采访'], ['项目', '音频'], tree, 'all')).toBe(false)
    expect(matchesVisionCollectionTagFilter(['孤立'], ['项目', '孤立'], tree, 'any')).toBe(true)
    expect(matchesVisionCollectionTagFilter(['孤立'], [], tree, 'all')).toBe(true)
    expect(matchesVisionCollectionTagFilter(['采访'], [], tree, 'any', ['项目'])).toBe(false)
    expect(matchesVisionCollectionTagFilter(['音频'], ['项目'], tree, 'any', ['采访'])).toBe(true)
    expect(matchesVisionCollectionTagFilter(['采访', '音频'], ['项目'], tree, 'any', ['音频'])).toBe(false)
  })

  it('hides descendants under a collapsed ancestor but keeps siblings visible', () => {
    expect(isVisionCollectionTagHiddenByCollapsedAncestor('采访', tree, ['项目'])).toBe(true)
    expect(isVisionCollectionTagHiddenByCollapsedAncestor('视频', tree, ['项目'])).toBe(true)
    expect(isVisionCollectionTagHiddenByCollapsedAncestor('孤立', tree, ['项目'])).toBe(false)
    expect(isVisionCollectionTagHiddenByCollapsedAncestor('项目', tree, ['项目'])).toBe(false)
  })

  it('supports multiple ancestor levels and ignores malformed cycles safely', () => {
    expect(isVisionCollectionTagHiddenByCollapsedAncestor('采访', tree, ['视频'])).toBe(true)
    const cyclic = [metadata('甲', '乙'), metadata('乙', '甲')]
    expect(isVisionCollectionTagHiddenByCollapsedAncestor('甲', cyclic, [])).toBe(false)
    expect(isVisionCollectionTagHiddenByCollapsedAncestor('甲', cyclic, ['乙'])).toBe(true)
  })

  it('normalizes and persists only active collapsed tags', () => {
    const preferences = normalizeVisionClipCollectionTagCollapsePreferences({ collapsedTags: [' 项目 ', '项目', '', '旧标签'] })
    expect(preferences).toEqual({ schemaVersion: 1, collapsedTags: ['项目', '旧标签'] })
    const raw = serializeVisionClipCollectionTagCollapsePreferences(preferences)
    expect(parseVisionClipCollectionTagCollapsePreferences(raw)).toEqual(preferences)
    expect(parseVisionClipCollectionTagCollapsePreferences('{invalid}')).toEqual({ schemaVersion: 1, collapsedTags: [] })
    expect(mergeVisionClipCollectionTagCollapsePreferences(['项目', '旧标签'], ['项目', '新增'])).toEqual(['项目'])
  })
})
