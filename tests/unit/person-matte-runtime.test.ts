import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { PersonMatteRuntime } from '../../src/core/ai/person-matte-runtime'

describe('person matte runtime', () => {
  it('does not try to load or download a model when local assets are missing', async () => {
    const runtime = new PersonMatteRuntime({ resourcePath: join(process.cwd(), 'resources') })

    expect(runtime.getStatus().available).toBe(false)
    await expect(runtime.prepare()).rejects.toThrow('模型文件不完整')
  })
})
