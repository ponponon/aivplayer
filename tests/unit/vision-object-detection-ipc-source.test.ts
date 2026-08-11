import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

describe('vision object detection IPC surface', () => {
  it('registers status in desktop and preload layers', () => {
    const projectRoot = process.cwd()
    const desktopSource = readFileSync(join(projectRoot, 'src/desktop/ipc-vision-object-detection.ts'), 'utf8')
    const indexSource = readFileSync(join(projectRoot, 'src/desktop/index.ts'), 'utf8')
    const preloadSource = readFileSync(join(projectRoot, 'src/preload/index.ts'), 'utf8')

    expect(desktopSource).toContain('VISION_OBJECT_DETECTION_STATUS')
    expect(desktopSource).toContain('VISION_OBJECT_DETECTION_RUN')
    expect(desktopSource).toContain('objectDetectionModelDirectory')
    expect(desktopSource).toContain('getVisionObjectDetectionModelStatus')
    expect(desktopSource).toContain('VisionObjectDetectionRuntime')
    expect(desktopSource).toContain('detectImage')
    expect(indexSource).toContain('registerVisionObjectDetectionIpc')
    expect(preloadSource).toContain('getVisionObjectDetectionStatus')
    expect(preloadSource).toContain('runVisionObjectDetection')
  })
})
