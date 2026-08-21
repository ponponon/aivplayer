# AIVPlayer 版本发布手册

本文档记录当前项目的正式发布流程，目标是让任何维护者都能按同一套步骤发布新版本。

当前发布入口仍是 GitHub Release；视觉模型、平台特定 Vision Pack 和官网当前版本的安装包由发布工作流同步到 Cloudflare R2。GitHub Release 是完整历史版本的权威来源，R2 只承担官网的低延迟下载入口，不替代 GitHub Release 的安装包校验，也不进入正式安装包资产清单。

## 一、发布链路总览

    修改版本号
      ↓
    本地检查与 release dry-run
      ↓
    提交版本变更
      ↓
    检查 push readiness
      ↓
    推送 main
      ↓
    创建并推送 v<version> tag
      ↓
    GitHub Actions 自动触发
      ├─ macOS 构建
      ├─ Windows x64 构建
      ├─ Windows arm64 构建
      ├─ Linux x64 构建
      └─ Linux arm64 构建
      ↓
    汇总安装包、更新元数据与 Vision Pack
      ↓
    上传 Vision Pack 到 Cloudflare R2
      ↓
    版本、格式、架构、资源、证据和 SHA-256 校验
      ↓
    创建 GitHub Release
      ↓
    通过 GitHub API 回读并校验远端资产
      ↓
    将当前版安装包同步到 R2，删除所有更早下载对象并更新只包含当前版本的稳定清单

正式发布工作流位于 `.github/workflows/release.yml`，由以下事件触发：

- 推送匹配 `v*` 的 Git tag，例如 `v0.6.0`；这是正式发布方式。
- 手动执行 `workflow_dispatch`；默认用于 `verify_only` 预演。如果某个 tag 已经推送但 Release 尚未创建，可在包含修复的分支上将 `verify_only` 设为 `false` 重跑该 tag；已发布版本不得用此方式覆盖资产。

### Release 文案约定

每个正式版本都必须在 `docs/releases/v<version>.md` 保存可直接展示在 GitHub Release 的正文。发布工作流会在创建 Release 前校验该文件并通过 `body_path` 使用它；缺少文案时，发布会在上传资产前失败。

正文按 PicGo v3.0.2 的清晰结构组织：先写用户可感知的 `Features`、`Performance`、`UI Improvements` 和 `Bug Fixes`，随后提供中英文版本；在底部单独放置 `国内可下载链接`，按 Windows、macOS、Linux 分平台，并把架构与安装包格式直接写成链接；最后保留 `Full Changelog`。

国内下载链接使用发布工作流同步后的 R2 公共路径：`https://releases.quniv.cn/aivplayer/releases/<version>/<asset>`。链接中的资产名称必须与 `release-manifest.json` 和 GitHub Release 完全一致；如果某个平台没有对应架构，只展示实际存在的安装包，不编造链接。

## 二、发布前准备

### 1. 确认版本规则

应用版本来自 `package.json` 的 `version` 字段，必须是三段式版本，例如 `0.6.0`。正式 tag 必须是对应的 `v` 前缀形式：

    package.json: 0.6.0
    Git tag:      v0.6.0

已发布版本视为不可变版本。不要移动或复用已经推送过的 tag；如果安装包内容发生变化，应递增版本号并创建新的 tag。

### 2. 更新版本号

推荐使用 npm 同时更新 `package.json` 和 `package-lock.json`：

    npm version 0.6.0 --no-git-tag-version

然后确认两个文件中的版本一致：

    node -e "const p=require('./package.json'); const l=require('./package-lock.json'); console.log({package:p.version, lock:l.version})"

如果本次版本包含明显的用户可见功能或修复，同时检查是否需要更新 README、版本说明或 Cloudflare Pages 页面。不要为了发布流程本身编造额外功能说明。

### 3. 本地验证

最低检查集：

    npm run typecheck
    npm run release:dry-run
    npm test

`release:dry-run` 会使用小型 fixture 模拟 macOS、Windows 和 Linux 的产物，验证平台契约、安装包格式、合并 evidence、版本、manifest 和 SHA-256。它不会联网、不会创建 Release，也不会上传文件。

完整 `npm test` 如果遇到需要监听本机端口或访问宿主运行时的测试，应在宿主权限环境中重跑并记录真实结果；不能把默认沙盒的 `EPERM` 直接当成代码回归。

### 4. 检查版本差异

发布前确认工作区只包含预期修改：

    git diff --check
    git status --short
    git diff -- package.json package-lock.json

提交前检查新增内容中没有 API key、token、密码、私钥或其他敏感信息。尤其不要把本地签名文件、证书、云服务凭据和安装包提交到 Git 仓库。

### 5. GitHub Actions 签名密钥

macOS 发布需要在 GitHub Actions Secrets 中配置以下变量：

- `MACOS_CSC_LINK`：`.p12` 文件的 Base64 内容；
- `MACOS_CSC_KEY_PASSWORD`：导出 `.p12` 时设置的密码；
- `APPLE_ID`：用于公证的 Apple 账号邮箱；
- `APPLE_APP_SPECIFIC_PASSWORD`：该 Apple 账号生成的 App 专用密码；
- `APPLE_TEAM_ID`：Apple Developer Team ID。

工作流会把 `.p12` 导入临时钥匙串 `signing_temp`，设置 `codesign` 的访问权限，并在任务结束时清理。不要把 `.p12`、私钥、导出密码或 App 专用密码写入仓库文件、workflow 明文或 Release 资产。

macOS job 会先只生成签名 `.app`，再使用 `notarytool` 提交并显式轮询公证状态，最多等待 60 分钟；只有状态为 `Accepted`、完成 staple 和验证后，才会用 `--prepackaged` 生成 DMG / ZIP。这样 Apple 公证队列或网络异常会在独立步骤中暴露，不会被误判为 DMG 打包卡住。

macOS 的 `--dir` 目标不会自动生成 `app-update.yml`；因此必须把固定的 `resources/app-update.yml` 配置作为 macOS 专属 `extraResources` 在签名前放入 `.app`。Windows / Linux 继续使用 electron-builder 原有的更新元数据生成流程。不能在签名后再改写应用资源；后续 `release:check-packaged-resources` 只对 macOS 校验该文件存在且包含完整配置，防止自动更新正常构建但在安装后报 `ENOENT`。

## 三、提交、检查并触发正式发布

### 1. 提交版本变更

使用项目约定的中文 commit message：

    git add package.json package-lock.json
    git commit -m "chore(发布) : 准备 0.6.0 版本"

如果还有与本版本直接相关的文档或代码变更，应一并审阅并按范围提交；不要把无关的本地修改混入发布提交。

### 2. 执行 push 前审计

先确保远端 `main` 已经是最新，然后执行只读审计：

    git fetch origin main
    npm run release:check-push -- --base-ref origin/main

该命令检查：

- 工作区是否干净；
- 相对 `origin/main` 的变更是否可追踪；
- commit message 是否符合项目格式和长度限制；
- 新增内容是否命中常见敏感信息模式；
- 内部计划文件是否误进入提交；
- 脚本自身不会执行 push 或 workflow 写操作。

### 3. 推送提交和 tag

审计通过后，先推送版本提交，再创建并推送正式 tag：

    git push origin main
    git tag -a v0.6.0 -m "发布 v0.6.0"
    git push origin v0.6.0

最后一个命令会触发 `Release` workflow。tag 推送前必须再次确认：

    git show -s --format='%h %s' HEAD
    git show -s --format='%D' v0.6.0
    git status --short

工作区应保持干净，tag 应指向刚刚推送的版本提交。

## 四、GitHub Actions 会做什么

### 1. 五个平台构建 job

以下五个构建 job 必须全部成功，`publish-release` 才会开始：

| Job | 目标 |
| --- | --- |
| `build-macos` | macOS arm64 安装包 |
| `build-windows` | Windows x64 安装包 |
| `build-windows-arm64` | Windows arm64 安装包 |
| `build-linux` | Linux x64 安装包 |
| `build-linux-arm64` | Linux arm64 安装包 |

每个平台在打包前会准备并检查 FFmpeg、HEIF 和 whisper.cpp，并单独构建只含当前平台原生依赖的 Vision Pack；SigLIP2 模型不再进入安装包，而是使用固定 revision 从 R2 下载。流水线同时检查二进制架构、打包后资源、安装包格式、体积报告和平台产物契约。构建 job 只上传 workflow artifact，不直接创建 GitHub Release。

### 2. `publish-release` 汇总和门禁

汇总 job 会按以下顺序执行：

1. 下载五个平台的 workflow artifact。
2. 通过 `release:assemble-artifacts` 合并安装包和更新元数据。
3. 检查 macOS、Windows、Linux 安装包格式。
4. 合并并校验五个平台的 evidence 报告。
5. 检查 `v<package.json.version>` 与输入 tag 完全一致。
6. 检查 `latest*.yml` 的版本、`url` / `path` 引用和实际文件名。
7. 生成并校验 `release-manifest.json`，记录资产大小与 SHA-256。
8. 创建 GitHub Release 并上传正式资产。
9. 把五个平台的 Vision Pack 及 manifest 上传到 R2，并使用固定版本 / 平台 / 架构路径。
10. 通过 GitHub API 回读 Release 资产，重新下载并校验大小、SHA-256 和 manifest 内容。
11. 将当前版安装包写入 R2 的 `aivplayer/releases/<version>/`，更新 `download-manifest.json`，并删除所有更早版本的安装包对象。
12. 保存不含凭据的远端校验报告作为 workflow artifact。

任何一个门禁失败，后续发布步骤都不应被视为成功。特别是“跳过了某个可选步骤”不能等同于“远端同步成功”。

### 3. GitHub Release 中应出现的资产

正式资产由 artifact policy 控制，主要包括：

- macOS：`.dmg`、`.zip`、`latest-mac.yml`；DMG / ZIP 使用 Developer ID Application 签名并由 GitHub Actions 公证；
- Windows：x64 / arm64 `.exe`、合并后的 `latest.yml`；
- Linux：x64 / arm64 `.AppImage`、`.deb`、`latest-linux.yml`、`latest-linux-arm64.yml`；
- 更新辅助文件：`.blockmap`；
- 发布审计清单：`release-manifest.json`。

平台 evidence 报告和合并 evidence 报告只作为 Actions artifact 保存，不应出现在 Release 下载资产中。

### 4. R2 视觉资源路径

- SigLIP2：`https://releases.quniv.cn/aivplayer/models/siglip2/<revision>/<file>`。
- Vision Pack：`https://releases.quniv.cn/aivplayer/vision-pack/<version>/<platform>-<arch>/`。
- Vision Pack 下载前校验远程 manifest，下载后校验归档 SHA-256，并使用临时目录原子替换到用户数据目录。

### 5. 官网桌面下载路径

- 官网读取稳定清单：`https://releases.quniv.cn/aivplayer/releases/download-manifest.json`。
- 安装包路径按版本隔离，例如：`https://releases.quniv.cn/aivplayer/releases/0.6.0/<asset>`。
- R2 只保留清单中的最新一个正式版本；更早版本统一从 GitHub Releases 下载。
- 发布工作流使用 `scripts/publish-release-downloads.mjs`；首次启用时，在 `Sync AIVPlayer Downloads` workflow 手动填入已发布 tag（默认 `v0.6.0`），即可把现有版本补齐到 R2。
- 官网不会把浏览器暴露的 `MacIntel` 直接当成真实 x64 架构；当 macOS 架构信息不可用时，会从当前平台清单中选择可用安装包。若未来补充 x64 资产，重新生成 Release 清单后即可在手动选择器中出现该选项。

该同步脚本只使用 `CLOUDFLARE_API_TOKEN` 完成 Pages 发布、R2 对象上传、清单更新和旧对象清理，不需要额外的 R2 S3 Access Key / Secret。当前 Cloudflare R2 REST 上传接口的单对象上限是 300 MB；脚本会在网络上传前拒绝更大的安装包，当前 v0.6.0 / v0.5.6 发布资产必须保持在该限制内。Actions 账号级别权限配置为：`Pages Read`、`Pages Write`、`Workers R2 Storage Write`（控制台有时显示为 R2 Storage 的 Edit）以及 `User → Memberships → Read`（供 Wrangler 读取账号成员关系）。`CLOUDFLARE_ACCOUNT_ID` 继续放在 Actions Variables 中，不要写入仓库。

- 0.6.0 仍将 FFmpeg、HEIF 和 whisper.cpp 内置；后续如需继续瘦身，可单独评估它们的按需下载。

## 五、正式发布后的检查

在 GitHub Actions 页面确认：

- `build-macos`、`build-windows`、`build-windows-arm64`、`build-linux`、`build-linux-arm64` 全部为绿色；
- `publish-release` 为绿色；
- `Create GitHub Release` 已执行，而不是被 `verify_only` 跳过；
- `Verify GitHub remote assets` 已执行并通过；
- GitHub Releases 页面出现目标版本和预期安装包；
- Release 的 tag 指向本次版本提交；
- Windows / Linux 的 `latest*.yml` 存在，且引用的安装包在同一个 Release 中。

命令行查看最近运行：

    gh run list --workflow Release --limit 5
    gh run view <run-id>
    gh release view v0.6.0

最终下载验证至少抽查一个 macOS、一个 Windows 和一个 Linux 安装包；对大文件不要只看文件名，优先检查 GitHub 页面显示的大小和 SHA-256。

## 六、正式发布前预演：`verify_only`

GitHub Actions 的 `workflow_dispatch` 支持 `verify_only` 输入。使用方式：

1. 在 GitHub Actions 打开 `Release` workflow。
2. 选择包含目标版本号的分支或提交。
3. 填写 `tag`，例如 `v0.6.0`。
4. 将 `verify_only` 设置为 `true`。
5. 等待五个平台构建和汇总门禁完成。

该模式仍会真实构建并检查全部平台产物、evidence、版本和 manifest，但会跳过：

- 创建 GitHub Release；
- GitHub 远端资产回读。

它适合验证 CI 构建环境、原生运行时和产物命名，不会证明 Release API 上传本身成功。预演通过后，仍需要推送正式 tag 才会进行实际发布。

本地快速预演只需执行：

    npm run release:dry-run

## 七、失败处理规则

### 构建 job 失败

先看具体平台 job 的第一处失败，不要只看最后的 `publish-release`。如果是下载超时、Runner 临时故障或缓存问题，可以在同一个 workflow 中重跑失败 job；如果是代码、依赖或产物命名问题，应修复后创建新的提交并重新预演。

### 汇总门禁失败

常见原因包括：

- tag 与 `package.json` 版本不一致；
- `latest*.yml` 引用了不存在或命名不一致的安装包；
- 平台 evidence 缺失、重叠或哈希漂移；
- 安装包格式或二进制架构检查失败；
- 合并目录中的文件集合与 manifest 不一致。

这类失败不应通过删除检查或手动改 Release 资产来绕过。修复根因后，使用新的版本号和新的 tag 重新发布。

### Release 已创建但远端回读失败

先确认失败是网络临时错误还是资产大小 / 哈希真的不一致。不要立即覆盖同一版本的安装包；已发布版本按不可变版本处理。若资产确实错误，修复后递增版本并重新创建 Release。

### 页面没有出现新版本

按以下顺序检查：

1. tag 是否已经推送到 GitHub；
2. `Release` workflow 是否被触发；
3. 五个平台构建是否全部成功；
4. `publish-release` 是否被依赖 job 阻塞；
5. Release 是否被创建为 draft 或仍在处理中；
6. tag 是否指向了包含目标 `package.json` 版本的提交。

## 八、发布前检查清单

- [ ] `package.json` 和 `package-lock.json` 版本一致。
- [ ] 版本号符合“主版本.次版本.修订版本”格式。
- [ ] README、更新说明和 Pages 页面已按需同步。
- [ ] `npm run typecheck` 通过。
- [ ] `npm run release:dry-run` 通过。
- [ ] `npm run release:report-package-size -- --directory release` 已生成体积报告。
- [ ] `npm test` 通过，宿主相关测试已在正确环境复核。
- [ ] `git diff --check` 通过。
- [ ] 没有敏感信息、签名文件或大体积安装包进入 Git 提交。
- [ ] commit message 符合项目格式。
- [ ] `npm run release:check-push -- --base-ref origin/main` 通过。
- [ ] 版本提交已经推送到 `main`。
- [ ] `v<version>` tag 指向正确提交并已推送。
- [ ] 五个平台构建和 `publish-release` 全部成功。
- [ ] macOS 安装包内部包含有效的 `Contents/Resources/app-update.yml`，自动更新配置门禁通过。
- [ ] GitHub Release 资产、tag、更新元数据和远端回读校验均正常。
- [ ] R2 稳定下载清单只包含当前版本，所有旧版本对象已清理，历史版本链接指向 GitHub Releases。

## 九、相关文件和命令索引

| 用途 | 文件或命令 |
| --- | --- |
| 正式工作流 | `.github/workflows/release.yml` |
| 版本检查 | `scripts/check-release-version.mjs` / `npm run release:check-version` |
| 平台产物检查 | `scripts/check-platform-release-artifacts.mjs` / `npm run release:check-platform` |
| 安装包格式检查 | `scripts/check-release-package-formats.mjs` / `npm run release:check-formats` |
| evidence 检查 | `scripts/check-platform-evidence.mjs` / `npm run release:check-evidence` |
| 产物汇总 | `scripts/assemble-release-artifacts.mjs` / `npm run release:assemble-artifacts` |
| manifest 生成与校验 | `scripts/release-manifest.mjs` / `npm run release:create-manifest`、`npm run release:check-manifest` |
| 本地发布演练 | `scripts/release-dry-run.mjs` / `npm run release:dry-run` |
| push 前审计 | `scripts/check-release-push-readiness.mjs` / `npm run release:check-push` |
| GitHub 远端校验 | `scripts/verify-remote-release.mjs` / `npm run release:verify-remote` |
| 官网下载同步 | `scripts/publish-release-downloads.mjs` / `npm run release:publish-downloads` |

如果修改了发布工作流、产物命名、平台构建矩阵或下载分发方式，必须同步更新本文档，并至少重新执行本地 dry-run、相关单测和 TypeScript 检查。
