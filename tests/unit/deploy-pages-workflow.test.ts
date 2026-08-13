import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const projectRoot = process.cwd()
const workflow = readFileSync(join(projectRoot, '.github/workflows/deploy-pages.yml'), 'utf8')

describe('Cloudflare Pages workflow', () => {
  it('only watches and deploys the public site directory', () => {
    expect(workflow).toContain('"docs/site/**"')
    expect(workflow).not.toContain('"docs/**"')
    expect(workflow).toContain('node --check docs/site/script.js')
    expect(workflow).toContain('Path("docs/site").rglob("*.html")')
    expect(workflow).toContain('wrangler@4 pages deploy docs/site')
  })

  it('keeps the public site assets separate from repository documentation', () => {
    expect(existsSync(join(projectRoot, 'docs/site/index.html'))).toBe(true)
    expect(existsSync(join(projectRoot, 'docs/site/privacy/index.html'))).toBe(true)
    expect(existsSync(join(projectRoot, 'docs/site/assets/icon.png'))).toBe(true)
    expect(existsSync(join(projectRoot, 'docs/RELEASE.md'))).toBe(true)
    expect(existsSync(join(projectRoot, 'docs/THIRD_PARTY_LICENSES.md'))).toBe(true)
  })
})
