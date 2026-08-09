import { mkdirSync, readFileSync } from 'node:fs'
import { mkdir, rename, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { normalizeSpeakerDiarizationCatalog, updateSpeakerDiarizationCatalog } from './speaker-diarization-catalog'
import type { SpeakerDiarizationCatalog, SpeakerDiarizationCatalogPatch } from '../../shared/speaker-diarization-catalog-types'

export function getSpeakerDiarizationCatalogPath(userDataPath: string): string {
  return join(userDataPath, 'library', 'speaker-diarization-catalog.json')
}

export class SpeakerDiarizationCatalogStore {
  private readonly catalogPath: string
  private catalog: SpeakerDiarizationCatalog
  private writeChain: Promise<void> = Promise.resolve()

  constructor(userDataPath: string) {
    this.catalogPath = getSpeakerDiarizationCatalogPath(userDataPath)
    mkdirSync(dirname(this.catalogPath), { recursive: true })
    try {
      this.catalog = normalizeSpeakerDiarizationCatalog(JSON.parse(readFileSync(this.catalogPath, 'utf8')))
    } catch {
      this.catalog = normalizeSpeakerDiarizationCatalog(null)
    }
  }

  get(): SpeakerDiarizationCatalog {
    return normalizeSpeakerDiarizationCatalog(this.catalog)
  }

  update(patch: SpeakerDiarizationCatalogPatch): SpeakerDiarizationCatalog {
    this.catalog = updateSpeakerDiarizationCatalog(this.catalog, patch)
    this.persist()
    return this.get()
  }

  async flush(): Promise<void> {
    await this.writeChain
  }

  private persist(): void {
    const serialized = JSON.stringify(this.catalog, null, 2)
    this.writeChain = this.writeChain.then(async () => {
      await mkdir(dirname(this.catalogPath), { recursive: true })
      const temporaryPath = `${this.catalogPath}.${process.pid}.tmp`
      await writeFile(temporaryPath, `${serialized}\n`, { encoding: 'utf8', mode: 0o600 })
      await rename(temporaryPath, this.catalogPath)
    }).catch(() => undefined)
  }
}
