import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { dirname, resolve } from 'node:path'

const execFileAsync = promisify(execFile)
const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const INTERNAL_PLAN_NAME = 'OPEN_SOURCE_INSPIRATION_PLAN.md'
const COMMIT_SUBJECT_PATTERN = /^(feat|fix|docs|style|refactor|perf|test|build|revert|chore)(\([^)]*\))? : .+$/
const SECRET_PATTERNS = [
  /AKIA[0-9A-Z]{16}/,
  /ghp_[A-Za-z0-9]{20,}/,
  /github_pat_[A-Za-z0-9_]{20,}/,
  /xox[baprs]-[A-Za-z0-9-]{10,}/,
  /-----BEGIN (RSA|OPENSSH|EC|DSA|PGP) PRIVATE KEY-----/,
  /AIza[0-9A-Za-z_-]{20,}/,
  /sk-[A-Za-z0-9]{20,}/
]

async function git(args) {
  try {
    const result = await execFileAsync('git', args, { cwd: projectRoot, maxBuffer: 16 * 1024 * 1024 })
    return result.stdout
  } catch (error) {
    const message = error?.stderr || error?.stdout || error?.message || String(error)
    throw new Error(`Git command failed: git ${args.join(' ')}\n${message.trim()}`)
  }
}

function parseOptions(argv) {
  const options = {}
  for (let index = 0; index < argv.length; index += 1) {
    const item = argv[index]
    const value = argv[index + 1]
    if (!value || value.startsWith('--')) continue
    if (item === '--base-ref') options.baseRef = value
    else continue
    index += 1
  }
  return options
}

export async function checkReleasePushReadiness(options = {}) {
  const baseRef = options.baseRef ?? process.env.RELEASE_BASE_REF ?? 'origin/main'
  const status = await git(['status', '--porcelain=v1', '--untracked-files=all'])
  if (status.trim()) throw new Error(`Working tree is not clean:\n${status.trim()}`)

  await git(['diff', '--check', `${baseRef}..HEAD`])
  const changedFiles = (await git(['diff', '--name-only', `${baseRef}..HEAD`])).split('\n').filter(Boolean)
  if (changedFiles.some((file) => file === INTERNAL_PLAN_NAME || file.endsWith(`/${INTERNAL_PLAN_NAME}`))) {
    throw new Error(`Internal plan must remain untracked: ${INTERNAL_PLAN_NAME}`)
  }

  const diff = await git(['diff', '--unified=0', `${baseRef}..HEAD`])
  const addedLines = diff.split('\n').filter((line) => line.startsWith('+') && !line.startsWith('+++')).join('\n')
  for (const pattern of SECRET_PATTERNS) {
    if (pattern.test(addedLines)) throw new Error(`Potential secret pattern found in added release changes: ${pattern}`)
  }

  const commitSubjects = (await git(['log', '--format=%s', `${baseRef}..HEAD`])).split('\n').filter(Boolean)
  const invalidSubjects = commitSubjects.filter((subject) => subject.length > 50 || !COMMIT_SUBJECT_PATTERN.test(subject))
  if (invalidSubjects.length > 0) throw new Error(`Invalid commit subject in release range: ${invalidSubjects.join(' | ')}`)

  return {
    ok: true,
    baseRef,
    commitCount: commitSubjects.length,
    changedFileCount: changedFiles.length,
    internalPlanIgnored: true,
    writesRemoteState: false
  }
}

async function main() {
  const result = await checkReleasePushReadiness(parseOptions(process.argv.slice(2)))
  console.log(`Release push readiness verified: ${result.commitCount} commit(s), ${result.changedFileCount} file(s), base ${result.baseRef}; no push performed`)
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  void main().catch((error) => {
    console.error(error instanceof Error ? error.message : error)
    process.exitCode = 1
  })
}
