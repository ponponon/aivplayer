import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const projectRoot = process.cwd()
const panel = readFileSync(join(projectRoot, 'src/renderer/src/app/vision-panel.tsx'), 'utf8')
const styles = readFileSync(join(projectRoot, 'src/renderer/src/styles/player/vision-library-results.css'), 'utf8')

describe('vision clip collection tag manager UI wiring', () => {
  it('aggregates tags and invokes global cleanup with confirmation', () => {
    expect(panel).toContain('collectionTagStats')
    expect(panel).toContain('managedCollectionTag')
    expect(panel).toContain('cleanupCollectionTag')
    expect(panel).toContain('window.aiv.cleanupVisionClipCollectionTag({ tag })')
    expect(panel).toContain('collectionTagManagerSelectTag')
    expect(panel).toContain('collectionTagManagerConfirm')
  })

  it('keeps tag management accessible and responsive', () => {
    expect(panel).toContain('role="list"')
    expect(panel).toContain('aria-pressed={managedCollectionTag === item.tag}')
    expect(panel).toContain('vision-collection-tag-manager-item')
    expect(styles).toContain('.vision-collection-tag-manager')
    expect(styles).toContain('flex-wrap: wrap')
    expect(styles).toContain(':focus-visible')
  })
})
