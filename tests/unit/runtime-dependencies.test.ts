import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const projectRoot = process.cwd()
const packageManifest = JSON.parse(readFileSync(join(projectRoot, 'package.json'), 'utf8')) as {
  dependencies?: Record<string, string>
}
const packageLock = JSON.parse(readFileSync(join(projectRoot, 'package-lock.json'), 'utf8')) as {
  packages?: Record<string, { dependencies?: Record<string, string>; version?: string; peer?: boolean }>
}

describe('desktop runtime dependencies', () => {
  it('declares LanceDB peer dependencies as production dependencies', () => {
    expect(packageManifest.dependencies?.['@lancedb/lancedb']).toBeTruthy()
    expect(packageManifest.dependencies?.['apache-arrow']).toBe('18.1.0')
    expect(packageLock.packages?.['']?.dependencies?.['apache-arrow']).toBe('18.1.0')
    expect(packageLock.packages?.['node_modules/apache-arrow']?.version).toBe('18.1.0')
    expect(packageLock.packages?.['node_modules/apache-arrow']?.peer).toBeUndefined()
  })
})
