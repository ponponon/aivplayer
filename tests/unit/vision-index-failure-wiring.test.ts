import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const projectRoot = process.cwd()

describe('vision index failure wiring', () => {
  it('keeps list, single retry and batch retry connected across IPC layers', () => {
    const channels = readFileSync(join(projectRoot, 'src/shared/ipc-channels.ts'), 'utf8')
    const ipc = readFileSync(join(projectRoot, 'src/desktop/ipc-vision.ts'), 'utf8')
    const preload = readFileSync(join(projectRoot, 'src/preload/index.ts'), 'utf8')

    for (const channel of ['VISION_INDEX_FAILURE_LIST', 'VISION_INDEX_FAILURE_RETRY', 'VISION_INDEX_FAILURE_BATCH_RETRY']) {
      expect(channels).toContain(channel)
      expect(ipc).toContain(`IPC_CHANNELS.${channel}`)
    }
    expect(ipc).toContain('beginRetryBatch')
    expect(ipc).toContain('VISION_INDEX_FAILURE_MAX_RETRY_BATCH')
    expect(preload).toContain('listVisionIndexFailures')
    expect(preload).toContain('retryVisionIndexFailure')
    expect(preload).toContain('retryVisionIndexFailures')
  })
})
