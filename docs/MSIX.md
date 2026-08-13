# Microsoft Store MSIX 发布

AIVPlayer 保留两条 Windows 分发链路：

- GitHub Release：继续发布 NSIS `.exe`，用于普通下载和 `electron-updater` 自动更新。
- Microsoft Store：额外生成 `.appx`，提交到 Partner Center；商店安装实例不使用 `electron-updater`，更新由 Microsoft Store 管理。

## 为什么不需要购买代码签名证书

本项目的 CI 生成的是供 Microsoft Store 提交的 MSIX/AppX 包，并不会把个人代码签名证书或私钥放进仓库、GitHub Secrets 或构建机。微软商店接收包后会按商店流程重新签名；因此这条商店分发链路不要求另外购买普通 Authenticode 证书。

如果要绕过商店直接把 `.appx` 分发给用户，则需要另外处理受信任签名和 sideload 部署，不能把本页面的商店包配置当作直接分发方案。

## 第一次配置 GitHub Actions

在 GitHub 仓库进入 `Settings → Secrets and variables → Actions → Variables`，新增以下 Repository variables。它们是 Partner Center 的公开包身份信息，不是私钥，因此使用 Variables 即可：

| 变量 | 值从哪里复制 | 说明 |
| --- | --- | --- |
| `MSIX_IDENTITY_NAME` | Partner Center 的应用产品身份 `Name` | 必须与商店预留的身份完全一致 |
| `MSIX_PUBLISHER` | Partner Center 的 `Publisher` | 通常是 `CN=...`，不要填显示名称 |
| `MSIX_PUBLISHER_DISPLAY_NAME` | Partner Center 的 `Publisher display name` | 商店显示的发布者名称 |
| `MSIX_APPLICATION_ID` | 可选；默认 `cn.quniv.aivplayer` | 只有 Partner Center 或现有包要求不同值时才设置 |

三个必需变量都存在时，Windows x64 和 ARM64 发布作业会分别上传：

- `windows-msix-x64`
- `windows-msix-arm64`

每个 artifact 内都有对应架构的 `.appx` 文件。变量尚未配置时，这两个可选步骤会跳过，不会影响现有 `.exe` 发布流程。

## 手动生成配置

身份信息只通过环境变量注入，脚本不会把它们写入版本库：

```powershell
$env:MSIX_IDENTITY_NAME = 'Partner Center 的 Name'
$env:MSIX_PUBLISHER = 'CN=Partner Center 的 Publisher'
$env:MSIX_PUBLISHER_DISPLAY_NAME = 'Ponponon'
$env:MSIX_APPLICATION_ID = 'cn.quniv.aivplayer'
npm run msix:generate-config
```

脚本生成的 `electron-builder-msix.generated.json` 被 `.gitignore` 忽略。Windows 环境完成应用构建后，可用下面的命令生成 x64 商店包：

```powershell
npm run build
npx electron-builder --config electron-builder-msix.generated.json --win --x64 --publish never
```

ARM64 将 `--x64` 换成 `--arm64`。产物位于 `release-msix/`，不会混入 `release/`，也不会被 GitHub Release 的普通安装包清单收录。

## 提交 Partner Center

1. 在应用的“包”页面添加 x64 和 ARM64 包。
2. 上传 Actions artifact 中对应架构的 `.appx`。
3. 让 Partner Center 做包验证，然后继续填写商店一览、年龄分级、隐私策略和支持信息。
4. 先保存草稿并确认包验证通过，再提交发布审核。

不要把 GitHub Release 的下载地址当作商店包 URL；商店提交使用上传的包，普通 `.exe` 下载地址是另一条分发链路。

## 更新行为

`src/desktop/app-updater.ts` 会在 `process.windowsStore` 为真时关闭 `electron-updater`。因此：

- 从 Microsoft Store 安装的版本由 Store 负责更新和回滚。
- 从 GitHub 下载的 NSIS `.exe` 仍按原有逻辑检查 GitHub Release 更新。
- 同一台机器上不要把 Store 版和普通 `.exe` 版混用为同一套更新来源。
