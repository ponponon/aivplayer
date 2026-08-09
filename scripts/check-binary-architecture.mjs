import { readFile } from 'node:fs/promises'
import { pathToFileURL } from 'node:url'

const PE_ARCHITECTURES = new Map([
  [0x8664, 'x64'],
  [0xaa64, 'arm64']
])
const ELF_ARCHITECTURES = new Map([
  [62, 'x64'],
  [183, 'arm64']
])

function readOptions(argv) {
  const options = { files: [] }
  for (let index = 0; index < argv.length; index += 1) {
    const item = argv[index]
    const value = argv[index + 1]
    if (!value || value.startsWith('--')) continue
    if (item === '--architecture') options.architecture = value
    else if (item === '--file') options.files.push(value)
    else continue
    index += 1
  }
  return options
}

export function detectBinaryArchitecture(buffer, filePath = '<buffer>') {
  if (buffer.length >= 64 && buffer.subarray(0, 2).toString('ascii') === 'MZ') {
    const peOffset = buffer.readUInt32LE(0x3c)
    if (peOffset + 6 > buffer.length || buffer.subarray(peOffset, peOffset + 4).toString('ascii') !== 'PE\u0000\u0000') {
      throw new Error(`Invalid PE header: ${filePath}`)
    }
    const machine = buffer.readUInt16LE(peOffset + 4)
    const architecture = PE_ARCHITECTURES.get(machine)
    if (!architecture) throw new Error(`Unsupported PE machine 0x${machine.toString(16)}: ${filePath}`)
    return architecture
  }

  if (buffer.length >= 20 && buffer.subarray(0, 4).equals(Buffer.from([0x7f, 0x45, 0x4c, 0x46]))) {
    const dataEncoding = buffer[5]
    if (dataEncoding !== 1) throw new Error(`Unsupported ELF byte order: ${filePath}`)
    const machine = buffer.readUInt16LE(18)
    const architecture = ELF_ARCHITECTURES.get(machine)
    if (!architecture) throw new Error(`Unsupported ELF machine ${machine}: ${filePath}`)
    return architecture
  }

  throw new Error(`Unsupported executable format: ${filePath}`)
}

export async function checkBinaryArchitectures(options = {}) {
  const architecture = options.architecture
  const files = options.files ?? []
  if (architecture !== 'x64' && architecture !== 'arm64') throw new Error(`Unsupported release architecture: ${String(architecture)}`)
  if (files.length === 0) throw new Error('At least one executable file is required.')

  const results = []
  for (const filePath of files) {
    const actualArchitecture = detectBinaryArchitecture(await readFile(filePath), filePath)
    if (actualArchitecture !== architecture) {
      throw new Error(`Binary architecture mismatch: ${filePath} is ${actualArchitecture}, expected ${architecture}`)
    }
    results.push({ path: filePath, architecture: actualArchitecture })
  }
  return { ok: true, architecture, files: results }
}

async function main() {
  const result = await checkBinaryArchitectures(readOptions(process.argv.slice(2)))
  console.log(`Binary architectures verified: ${result.architecture}, ${result.files.length} file(s)`)
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  void main().catch((error) => {
    console.error(error instanceof Error ? error.message : error)
    process.exitCode = 1
  })
}
