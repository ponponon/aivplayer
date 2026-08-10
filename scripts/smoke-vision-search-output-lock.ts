import { mkdtemp, rm } from 'node:fs/promises'
import { spawn } from 'node:child_process'
import { createInterface } from 'node:readline'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'

type ChildResult = {
  code: number | null
  payload: Record<string, unknown>
  stderr: string
}

function startChild(sourceUrl: string, outputPath: string, holdMs: number): { child: ReturnType<typeof spawn>; firstLine: Promise<Record<string, unknown>>; result: Promise<ChildResult> } {
  const script = `
    import { acquireVisionSearchExportOutputLock } from ${JSON.stringify(sourceUrl)}
    try {
      const lock = await acquireVisionSearchExportOutputLock(${JSON.stringify(outputPath)}, 'smoke-child')
      console.log(JSON.stringify({ ok: true, lockPath: lock.lockPath }))
      await new Promise((resolve) => setTimeout(resolve, ${holdMs}))
      await lock.release()
    } catch (error) {
      console.log(JSON.stringify({ ok: false, code: error?.code ?? '', name: error?.name ?? '', message: error?.message ?? String(error) }))
    }
  `
  const child = spawn(process.execPath, ['--experimental-strip-types', '--input-type=module', '-e', script], { stdio: ['ignore', 'pipe', 'pipe'] })
  const lines = createInterface({ input: child.stdout })
  let resolveFirstLine: (payload: Record<string, unknown>) => void = () => undefined
  let rejectFirstLine: (error: Error) => void = () => undefined
  const firstLine = new Promise<Record<string, unknown>>((resolveLine, rejectLine) => {
    resolveFirstLine = resolveLine
    rejectFirstLine = rejectLine
  })
  let firstLineSeen = false
  lines.on('line', (line) => {
    if (firstLineSeen) return
    firstLineSeen = true
    try {
      resolveFirstLine(JSON.parse(line) as Record<string, unknown>)
    } catch {
      rejectFirstLine(new Error(`子进程输出不是 JSON：${line}`))
    }
  })
  let stderr = ''
  child.stderr.on('data', (chunk) => { stderr += String(chunk) })
  const result = new Promise<ChildResult>((resolveResult, rejectResult) => {
    child.on('error', rejectResult)
    child.on('close', (code) => {
      if (!firstLineSeen) rejectFirstLine(new Error(`子进程未输出结果，stderr：${stderr}`))
      void firstLine.catch(() => undefined)
      const payload = firstLineSeen ? undefined : undefined
      void payload
      resolveResult({ code, payload: {}, stderr })
    })
  })
  const parsedResult = result.then(async (value) => {
    const payload = await firstLine
    return { ...value, payload }
  })
  return { child, firstLine, result: parsedResult }
}

async function main(): Promise<void> {
  const root = await mkdtemp(join(tmpdir(), 'aivplayer-export-lock-smoke-'))
  try {
    const outputPath = join(root, 'results.json')
    const sourceUrl = pathToFileURL(resolve('src/core/ai/vision-search-export-lock.ts')).href
    const first = startChild(sourceUrl, outputPath, 700)
    const firstPayload = await first.firstLine
    if (firstPayload.ok !== true) throw new Error(`第一个锁进程未成功：${JSON.stringify(firstPayload)}`)

    const second = startChild(sourceUrl, outputPath, 0)
    const secondResult = await second.result
    if (secondResult.payload.code !== 'VISION_SEARCH_EXPORT_OUTPUT_LOCKED') throw new Error(`第二个进程未报告锁冲突：${JSON.stringify(secondResult)}`)
    const firstResult = await first.result
    if (firstResult.payload.ok !== true || firstResult.code !== 0) throw new Error(`第一个进程释放锁失败：${JSON.stringify(firstResult)}`)

    const third = startChild(sourceUrl, outputPath, 0)
    const thirdResult = await third.result
    if (thirdResult.payload.ok !== true || thirdResult.code !== 0) throw new Error(`释放后第三个进程未能抢到锁：${JSON.stringify(thirdResult)}`)
    console.log(JSON.stringify({ ok: true, first: firstResult.payload, second: secondResult.payload, third: thirdResult.payload, lockPath: firstPayload.lockPath }))
  } finally {
    await rm(root, { recursive: true, force: true })
  }
}

void main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
