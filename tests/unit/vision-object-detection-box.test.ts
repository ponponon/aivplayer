import { describe, expect, it } from 'vitest'
import { projectVisionObjectDetectionBox } from '../../src/core/ai/vision-object-detection-box'

describe('vision object detection box projection', () => {
  it('projects detector pixels into a percentage overlay', () => {
    expect(projectVisionObjectDetectionBox(
      { xmin: 100, ymin: 50, xmax: 500, ymax: 350 },
      1000,
      500
    )).toEqual({ left: 10, top: 10, width: 40, height: 60 })
  })

  it('clips boxes that extend beyond the thumbnail bounds', () => {
    expect(projectVisionObjectDetectionBox(
      { xmin: -20, ymin: 40, xmax: 120, ymax: 220 },
      100,
      200
    )).toEqual({ left: 0, top: 20, width: 100, height: 80 })
  })

  it('rejects invalid dimensions and boxes outside the image', () => {
    expect(projectVisionObjectDetectionBox({ xmin: 1, ymin: 1, xmax: 1, ymax: 2 }, 100, 100)).toBeNull()
    expect(projectVisionObjectDetectionBox({ xmin: 120, ymin: 1, xmax: 130, ymax: 2 }, 100, 100)).toBeNull()
    expect(projectVisionObjectDetectionBox({ xmin: 1, ymin: 1, xmax: 2, ymax: 3 }, 0, 100)).toBeNull()
  })
})
