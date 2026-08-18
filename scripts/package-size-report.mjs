import { readdir, stat, writeFile } from 'node:fs/promises'
import { basename, join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'

const DEFAULT_BUDGET_BYTES = 150 * 1024 * 1024

function readOptions(argv) {
  const options = { directory: 'release', output: null, budgetBytes: DEFAULT_BUDGET_BYTES }
  for (let index = 0; index < argv.length; index += 1) {
    const name = argv[index]
    const value = argv[index + 1]
    if (!value || value.startsWith('--')) continue
    if (name === '--directory') options.directory = value
    else if (name === '--output') options.output = value
    else if (name === '--budget-mb') options.budgetBytes = Number(value) * 1024 * 1024
    index += 1
  }
  return options
}

async function collectFiles(directory, root = directory, files = []) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const filePath = join(directory, entry.name)
    if (entry.isDirectory()) await collectFiles(filePath, root, files)
    else {
      const fileStat = await stat(filePath)
      files.push({ path: filePath.slice(root.length + 1), sizeBytes: fileStat.size })
    }
  }
  return files
}

export async function createPackageSizeReport(options = {}) {
  const directory = resolve(options.directory ?? 'release')
  const budgetBytes = options.budgetBytes ?? DEFAULT_BUDGET_BYTES
  const files = (await collectFiles(directory)).sort((left, right) => right.sizeBytes - left.sizeBytes)
  const totalBytes = files.reduce((total, file) => total + file.sizeBytes, 0)
  const topLevel = new Map()
  for (const file of files) {
    const component = file.path.split(/[\\/]/u)[0] ?? basename(file.path)
    topLevel.set(component, (topLevel.get(component) ?? 0) + file.sizeBytes)
  }
  const components = [...topLevel.entries()]
    .map(([name, sizeBytes]) => ({ name, sizeBytes }))
    .sort((left, right) => right.sizeBytes - left.sizeBytes)
  const installers = files.filter((file) => /\.(?:dmg|zip|exe|AppImage|deb)$/iu.test(file.path))
  const largestInstallerBytes = installers[0]?.sizeBytes ?? totalBytes
  return {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    directory,
    budgetBytes,
    totalBytes,
    withinBudget: largestInstallerBytes <= budgetBytes,
    largestInstallerBytes,
    installers,
    fileCount: files.length,
    components,
    largestFiles: files.slice(0, 20)
  }
}

async function main() {
  const options = readOptions(process.argv.slice(2))
  const report = await createPackageSizeReport(options)
  const output = options.output ? resolve(options.output) : null
  if (output) await writeFile(output, `${JSON.stringify(report, null, 2)}\n`, 'utf8')
  console.log(JSON.stringify({ directory: report.directory, totalBytes: report.totalBytes, largestInstallerBytes: report.largestInstallerBytes, budgetBytes: report.budgetBytes, withinBudget: report.withinBudget }, null, 2))
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  void main().catch((error) => {
    console.error(error)
    process.exitCode = 1
  })
}
