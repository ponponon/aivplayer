import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

describe('vision object detection settings UI surface', () => {
  it('keeps the model status and directory picker visible in video settings', () => {
    const projectRoot = process.cwd()
    const videoSource = readFileSync(join(projectRoot, 'src/renderer/src/app/settings-sections/video.tsx'), 'utf8')
    const styleSource = readFileSync(join(projectRoot, 'src/renderer/src/styles/player/settings-fields.css'), 'utf8')
    const settingsSource = readFileSync(join(projectRoot, 'src/shared/app-settings.ts'), 'utf8')

    expect(videoSource).toContain('settings-vision-object-detection')
    expect(videoSource).toContain('getVisionObjectDetectionStatus')
    expect(videoSource).toContain('settings.vision.objectDetectionModelDirectory')
    expect(videoSource).toContain("patchSettingsSection('vision', { objectDetectionModelDirectory })")
    expect(videoSource).toContain('settingsDialog.video.objectDetection')
    expect(styleSource).toContain('.settings-vision-object-detection-status')
    expect(styleSource).toContain('.settings-vision-object-detection-message.is-success')
    expect(settingsSource).toContain('objectDetectionModelDirectory: string | null')
  })
})
