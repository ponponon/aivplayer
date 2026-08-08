import { readFile } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'

type PackageJson = {
  license?: string
  dependencies?: Record<string, string>
}

type InstalledPackageJson = {
  name?: string
  version?: string
  license?: string
  licenses?: Array<{ type?: string }>
}

export type LicenseManifestCheckResult = {
  ok: boolean
  checkedPackages: string[]
  errors: string[]
}

async function readJson<T>(path: string): Promise<T> {
  return JSON.parse(await readFile(path, 'utf8')) as T
}

function getLicense(packageJson: InstalledPackageJson): string | null {
  if (typeof packageJson.license === 'string' && packageJson.license.trim()) return packageJson.license.trim()
  const licenses = packageJson.licenses?.map((license) => license.type?.trim()).filter((license): license is string => Boolean(license)) ?? []
  return licenses.length > 0 ? licenses.join(' OR ') : null
}

export async function checkLicenseManifest(rootDirectory = resolve('.')): Promise<LicenseManifestCheckResult> {
  const packageJson = await readJson<PackageJson>(join(rootDirectory, 'package.json'))
  const manifestPath = join(rootDirectory, 'docs', 'THIRD_PARTY_LICENSES.md')
  const manifest = await readFile(manifestPath, 'utf8')
  const errors: string[] = []
  const checkedPackages = [...Object.keys(packageJson.dependencies ?? {}), 'electron']

  if (packageJson.license !== 'MIT') errors.push('package.json must declare MIT as the project license.')
  const projectLicense = await readFile(join(rootDirectory, 'LICENSE'), 'utf8').catch(() => '')
  if (!projectLicense.includes('MIT License') || !projectLicense.includes('Copyright (c) 2026 ponponon')) {
    errors.push('LICENSE is missing the expected AIVPlayer MIT license text.')
  }

  for (const packageName of checkedPackages) {
    const installedPath = join(rootDirectory, 'node_modules', ...packageName.split('/'), 'package.json')
    const installed = await readJson<InstalledPackageJson>(installedPath).catch(() => null)
    if (!installed) {
      errors.push(`Installed package metadata is missing: ${packageName}`)
      continue
    }
    const license = getLicense(installed)
    if (!installed.version || !license) {
      errors.push(`Installed package metadata is incomplete: ${packageName}`)
      continue
    }
    const row = `| \`${packageName}\` | \`${installed.version}\` | ${license} |`
    if (!manifest.includes(row)) errors.push(`License manifest is stale or incomplete for ${packageName}: ${row}`)
  }

  return { ok: errors.length === 0, checkedPackages, errors }
}

async function main(): Promise<void> {
  const result = await checkLicenseManifest()
  if (!result.ok) {
    console.error(['License manifest check failed.', ...result.errors.map((error) => `- ${error}`)].join('\n'))
    process.exitCode = 1
    return
  }
  console.log(`License manifest is current for ${result.checkedPackages.length} packaged/runtime packages.`)
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  void main().catch((error) => {
    console.error(error instanceof Error ? error.message : error)
    process.exitCode = 1
  })
}
