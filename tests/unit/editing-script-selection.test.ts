import { describe, expect, it } from 'vitest'
import { selectEditingScriptSegmentRange } from '../../src/core/editing/script-selection'

const segments = [
  { id: 'one', sourceId: 'source', sourceStartSeconds: 0, sourceEndSeconds: 1, text: '一' },
  { id: 'deleted', sourceId: 'source', sourceStartSeconds: 1, sourceEndSeconds: 2, text: '已删除', deleted: true },
  { id: 'two', sourceId: 'source', sourceStartSeconds: 2, sourceEndSeconds: 3, text: '二' },
  { id: 'three', sourceId: 'source', sourceStartSeconds: 3, sourceEndSeconds: 4, text: '三' }
]

describe('editing script segment selection', () => {
  it('includes the anchor and skips deleted rows when extending a range', () => {
    expect(selectEditingScriptSegmentRange(segments, [], 'one', 'two')).toEqual(['one', 'two'])
    expect(selectEditingScriptSegmentRange(segments, [], 'three', 'one')).toEqual(['one', 'two', 'three'])
  })

  it('preserves existing selections and toggles without a valid anchor', () => {
    expect(selectEditingScriptSegmentRange(segments, ['one'], null, 'two')).toEqual(['one', 'two'])
    expect(selectEditingScriptSegmentRange(segments, ['one', 'two'], null, 'two')).toEqual(['one'])
  })
})
