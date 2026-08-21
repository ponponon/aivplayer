#!/usr/bin/env node
/**
 * 将 package.json 的版本号同步到 Flatpak MetaInfo 的 releases 列表。
 *
 * 用法：
 *   node scripts/sync-flatpak-metainfo.mjs
 *
 * 说明：
 *   - 如果 MetaInfo 最新 release 版本与 package.json 不一致，则在 <releases> 顶部
 *     插入一条新 release 条目（可附加 --description 或读取 package.json 的 changelog）。
 *   - 如果一致，则什么都不做（幂等）。
 */
import { readFile, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const packageJsonPath = join(root, 'package.json')
const metainfoPath = join(root, 'flatpak/cn.quniv.aivplayer.metainfo.xml')

const packageJson = JSON.parse(await readFile(packageJsonPath, 'utf8'))
const version = String(packageJson.version)
let metainfo = await readFile(metainfoPath, 'utf8')

const latestRelease = metainfo.match(/<release version="([^"]+)"[^>]*>/)
if (latestRelease?.[1] === version) {
  console.log(`MetaInfo 已是最新版本 ${version}，无需同步`)
  process.exit(0)
}

const date = new Date().toISOString().slice(0, 10)
const descriptionArg = process.argv.indexOf('--description')
let description = 'Update for AIVPlayer ${version}.'
if (descriptionArg !== -1 && process.argv[descriptionArg + 1]) {
  description = process.argv[descriptionArg + 1]
}

const releaseEntry = `    <release version="${version}" date="${date}">
      <description>
        <p>${description.replaceAll('${version}', version)}</p>
      </description>
    </release>
`

const releasesMatch = metainfo.match(/  <releases>\n/)
if (!releasesMatch) {
  throw new Error(`MetaInfo 中找不到 <releases> 标签：${metainfoPath}`)
}

metainfo = metainfo.replace(/  <releases>\n/, `  <releases>\n${releaseEntry}`)
await writeFile(metainfoPath, metainfo)
console.log(`已同步 MetaInfo：新增 release ${version} (${date})`)
