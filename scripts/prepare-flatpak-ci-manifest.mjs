import { readFile, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'

const [inputPath, outputPath] = process.argv.slice(2)

if (!inputPath || !outputPath) {
  throw new Error('用法：node scripts/prepare-flatpak-ci-manifest.mjs <manifest> <output>')
}

const input = resolve(inputPath)
const output = resolve(outputPath)
const text = await readFile(input, 'utf8')
const sourcePattern = /      - type: git\n        url: https:\/\/github\.com\/ponponon\/aivplayer\.git\n        (?:tag: [^\n]+|commit: [0-9a-f]{40})\n        dest: app/

if (!sourcePattern.test(text)) {
  throw new Error('没有找到可替换的 AIVPlayer git source')
}

const localSource = [
  '      - type: dir',
  '        path: ci-source',
  '        dest: app'
].join('\n')

await writeFile(output, text.replace(sourcePattern, localSource), 'utf8')
console.log(`已生成 Flatpak CI 本地源码 manifest：${output}`)
