import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { VISION_FRAME_INTERVAL_SECONDS, VISION_MODEL_ID, VISION_MODEL_VARIANT, VISION_VECTOR_DISTANCE_TYPE, VISION_VECTOR_INDEX_MIN_ROWS, VISION_VECTOR_INDEX_TYPE } from '../../src/shared/vision-types'
import { getVisionModelPaths } from '../../src/main/ai/vision-model'
import { calculateVisionLexicalMatch, combineVisionHybridScore } from '../../src/main/ai/vision-search'

const projectRoot = process.cwd()

describe('vision library setup', () => {
  it('uses the checked-in model layout and the expected frame interval', () => {
    const paths = getVisionModelPaths(join(projectRoot, 'resources'))

    expect(VISION_MODEL_ID).toBe('siglip2-base-patch16-224-ONNX')
    expect(VISION_MODEL_VARIANT).toBe('uint8')
    expect(VISION_FRAME_INTERVAL_SECONDS).toBe(3)
    expect(VISION_VECTOR_DISTANCE_TYPE).toBe('dot')
    expect(VISION_VECTOR_INDEX_TYPE).toBe('IVF_FLAT')
    expect(VISION_VECTOR_INDEX_MIN_ROWS).toBe(10_000)
    expect(paths.combinedModelPath.endsWith('onnx/model_uint8.onnx')).toBe(true)
    expect(paths.textModelPath.endsWith('onnx/text_model_uint8.onnx')).toBe(true)
    expect(paths.visionModelPath.endsWith('onnx/vision_model_uint8.onnx')).toBe(true)
  })

  it('keeps the local model files available for development', () => {
    const paths = getVisionModelPaths(join(projectRoot, 'resources'))
    expect(existsSync(paths.combinedModelPath)).toBe(true)
    expect(existsSync(paths.textModelPath)).toBe(true)
    expect(existsSync(paths.visionModelPath)).toBe(true)
  })

  it('exposes the visual search IPC surface', () => {
    const source = readFileSync(join(projectRoot, 'src/main/ipc-vision.ts'), 'utf8')
    expect(source).toContain('VISION_INDEX_START')
    expect(source).toContain('VISION_INDEX_CANCEL')
    expect(source).toContain('VISION_SEARCH_TEXT')
    expect(source).toContain('VISION_SEARCH_IMAGE')
    expect(source).toContain('VISION_SCAN_DIRECTORY_START')
    expect(source).toContain('VISION_SCAN_DIRECTORY_CANCEL')
  })

  it('scores subtitle and filename matches for hybrid retrieval', () => {
    const subtitleMatch = calculateVisionLexicalMatch('红色汽车', '夜晚的红色汽车正在城市道路上行驶', 'demo.mp4')
    const filenameMatch = calculateVisionLexicalMatch('城市夜景', '', '城市夜景-红色汽车.mp4')

    expect(subtitleMatch?.source).toBe('subtitle')
    expect(subtitleMatch?.score).toBeGreaterThan(0.8)
    expect(filenameMatch?.source).toBe('filename')
    expect(filenameMatch?.score).toBeGreaterThan(0.4)
    expect(combineVisionHybridScore(1, 1)).toBe(1)
    expect(combineVisionHybridScore(0, 1)).toBeCloseTo(0.45)
  })

  it('keeps the incremental manifest and caption tables in the library source', () => {
    const source = readFileSync(join(projectRoot, 'src/main/ai/vision-library.ts'), 'utf8')
    expect(source).toContain("SOURCE_TABLE_NAME = 'video_sources'")
    expect(source).toContain("CAPTION_TABLE_NAME = 'video_captions'")
    expect(source).toContain("SEARCH_DOCUMENT_TABLE_NAME = 'video_search_documents'")
    expect(source).toContain("baseTokenizer: 'ngram'")
    expect(source).toContain('fullTextSearch(query')
    expect(source).toContain('isVideoSourceUnchanged')
    expect(source).toContain('refreshCaptions')
    expect(source).toContain("distanceType(VISION_VECTOR_DISTANCE_TYPE)")
    expect(source).toContain('Index.ivfFlat')
    expect(source).toContain('maintainVectorIndex')
    expect(source).toContain("stage: 'planning'")
    expect(source).toContain("stage: 'loading-model'")
    expect(source).toContain("stage: 'frames'")
    expect(source).toContain("stage: 'vector-index'")
    expect(source).toContain("stage: 'text-index'")
    expect(source).toContain("stage: 'completed'")
    expect(source).toContain('prepareImageModel')
    expect(source).toContain('getTimings')
    expect(source).toContain("mode: VisionSearchMode = 'hybrid'")
  })
})
