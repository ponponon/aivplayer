import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const projectRoot = process.cwd()

describe('task center wiring', () => {
  it('keeps the shared event protocol and preload listener connected', () => {
    const channels = readFileSync(join(projectRoot, 'src/shared/ipc-channels.ts'), 'utf8')
    const preload = readFileSync(join(projectRoot, 'src/preload/index.ts'), 'utf8')
    const bridge = readFileSync(join(projectRoot, 'src/desktop/task-center-events.ts'), 'utf8')
    expect(channels).toContain('TASK_CENTER_EVENT')
    expect(channels).toContain('TASK_CENTER_LIST')
    expect(channels).toContain('TASK_CENTER_CLEAR_FINISHED')
    expect(preload).toContain('onTaskCenterEvent')
    expect(preload).toContain('getTaskCenterEvents')
    expect(preload).toContain('clearTaskCenterFinished')
    expect(bridge).toContain('TASK_CENTER_EVENT')
  })

  it('mounts the global task center without replacing existing panels', () => {
    const overlays = readFileSync(join(projectRoot, 'src/renderer/src/app/app-overlays.tsx'), 'utf8')
    const taskCenter = readFileSync(join(projectRoot, 'src/renderer/src/app/task-center.tsx'), 'utf8')
    expect(overlays).toContain('<TaskCenter')
    expect(taskCenter).toContain('useTaskCenter')
    expect(taskCenter).toContain('clearFinished')
    expect(taskCenter).toContain('filterTaskCenterEvents')
    expect(taskCenter).toContain('paginateTaskCenterEvents')
    expect(taskCenter).toContain('task-center-filters')
    expect(taskCenter).toContain('task-center-pagination')
    expect(taskCenter).toContain('cancelVisionSearchResultsFullExport')
    expect(taskCenter).toContain('retryVisionSearchResultsFullExport')
    expect(taskCenter).toContain('task-center-cancel')
    expect(taskCenter).toContain('task-center-retry')
    const hook = readFileSync(join(projectRoot, 'src/renderer/src/app/use-task-center.ts'), 'utf8')
    expect(hook).toContain('getTaskCenterEvents')
    expect(hook).toContain('clearTaskCenterFinished')
    expect(readFileSync(join(projectRoot, 'src/desktop/ipc-task-center.ts'), 'utf8')).toContain('clearFinished')
  })

  it('fans out all long-running media workflows into the adapter layer', () => {
    const services = readFileSync(join(projectRoot, 'src/desktop/desktop-services.ts'), 'utf8')
    const vision = readFileSync(join(projectRoot, 'src/desktop/ipc-vision.ts'), 'utf8')
    const asr = readFileSync(join(projectRoot, 'src/desktop/ipc-asr-subtitles.ts'), 'utf8')
    const evidence = readFileSync(join(projectRoot, 'src/desktop/ipc-evidence-task.ts'), 'utf8')
    const drama = readFileSync(join(projectRoot, 'src/desktop/ipc-drama.ts'), 'utf8')
    expect(services).toContain('createBatchSubtitleTaskCenterEvent')
    expect(services).toContain('createMediaImportTaskCenterEvent')
    expect(vision).toContain('createVisionTaskCenterEvent')
    expect(vision).toContain('includeObjectEvidence')
    expect(asr).toContain('sendAsrTaskCenterEvent')
    expect(evidence).toContain('createEvidenceTaskCenterEvent')
    expect(drama).toContain('createDramaTaskCenterEvent')
  })
})
