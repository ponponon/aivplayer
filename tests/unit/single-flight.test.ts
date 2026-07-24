import { describe, expect, it } from 'vitest'
import { SingleFlight } from '../../src/core/ai/single-flight'

describe('SingleFlight', () => {
  it('shares an in-flight task and removes it after completion', async () => {
    const flight = new SingleFlight<number, AbortController>()
    let taskCalls = 0
    const create = () => ({
      context: new AbortController(),
      task: async () => {
        taskCalls += 1
        return 42
      }
    })

    const first = flight.start('same-request', create)
    const second = flight.start('same-request', create)

    expect(first.joined).toBe(false)
    expect(second.joined).toBe(true)
    expect(second.promise).toBe(first.promise)
    expect(second.context).toBe(first.context)
    await expect(first.promise).resolves.toBe(42)
    expect(taskCalls).toBe(1)
    expect(flight.has('same-request')).toBe(false)
  })
})
