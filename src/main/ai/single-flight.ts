export type SingleFlightTask<T, C> = (context: C) => Promise<T>

type SingleFlightEntry<T, C> = {
  context: C
  promise: Promise<T>
}

export class SingleFlight<T, C> {
  private readonly entries = new Map<string, SingleFlightEntry<T, C>>()

  has(key: string): boolean {
    return this.entries.has(key)
  }

  start(key: string, create: () => { context: C; task: SingleFlightTask<T, C> }): { context: C; promise: Promise<T>; joined: boolean } {
    const existing = this.entries.get(key)
    if (existing) return { ...existing, joined: true }

    const { context, task } = create()
    const promise = Promise.resolve().then(() => task(context))
    const entry = { context, promise }
    this.entries.set(key, entry)
    void promise.then(
      () => this.remove(key, promise),
      () => this.remove(key, promise)
    )
    return { ...entry, joined: false }
  }

  private remove(key: string, promise: Promise<T>): void {
    if (this.entries.get(key)?.promise === promise) this.entries.delete(key)
  }
}
