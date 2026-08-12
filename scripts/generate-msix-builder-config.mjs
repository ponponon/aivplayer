import { mkdir, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'

const outputPath = resolve(process.argv[2] ?? process.env.MSIX_CONFIG_PATH ?? 'electron-builder-msix.generated.json')
const identityName = process.env.MSIX_IDENTITY_NAME?.trim()
const publisher = process.env.MSIX_PUBLISHER?.trim()
const publisherDisplayName = process.env.MSIX_PUBLISHER_DISPLAY_NAME?.trim()
const applicationId = (process.env.MSIX_APPLICATION_ID?.trim() || 'cn.quniv.aivplayer')

const missing = [
  ['MSIX_IDENTITY_NAME', identityName],
  ['MSIX_PUBLISHER', publisher],
  ['MSIX_PUBLISHER_DISPLAY_NAME', publisherDisplayName]
].filter(([, value]) => !value).map(([name]) => name)

if (missing.length > 0) {
  throw new Error(`缺少 Microsoft Store 包身份参数：${missing.join(', ')}`)
}

if (!/^[A-Za-z0-9.]+$/.test(applicationId)) {
  throw new Error(`MSIX_APPLICATION_ID 只能包含字母、数字和点号：${applicationId}`)
}

const config = {
  extends: 'electron-builder.yml',
  directories: {
    output: 'release-msix'
  },
  win: {
    target: ['appx'],
    signExecutable: false
  },
  appx: {
    applicationId,
    identityName,
    publisher,
    publisherDisplayName,
    displayName: 'AIVPlayer',
    languages: ['zh-CN', 'en-US', 'ja-JP', 'ko-KR'],
    capabilities: ['runFullTrust'],
    electronUpdaterAware: false,
    artifactName: '${productName}-${version}-${arch}.${ext}'
  }
}

await mkdir(dirname(outputPath), { recursive: true })
await writeFile(outputPath, `${JSON.stringify(config, null, 2)}\n`, 'utf8')
console.log(`已生成 MSIX electron-builder 配置：${outputPath}`)
