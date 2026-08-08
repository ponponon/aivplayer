# AIVPlayer 第三方许可证与归属

本文件记录 AIVPlayer 当前直接运行时依赖、随安装包提供的运行时组件，以及用于功能研究的参考项目。它不是法律意见，也不是完整的传递依赖 SBOM；发布前仍需运行 `npm run check:licenses` 并核对实际打包运行时的构建参数。

## AIVPlayer

- AIVPlayer 本身使用 MIT License，完整文本见仓库根目录 [`LICENSE`](../LICENSE)。
- 本项目没有复制 OpenList、VLC、Pireel 或其他参考仓库的代码、Logo、截图、字体和专有素材。

## 直接运行时依赖

版本取自当前安装的 `node_modules/*/package.json`；修改依赖版本后，必须重新运行许可证检查并更新本表。

| 包 | 当前版本 | 许可证 | 上游 |
| --- | --- | --- | --- |
| `@huggingface/transformers` | `4.2.0` | Apache-2.0 | [transformers.js](https://github.com/huggingface/transformers.js) |
| `@lancedb/lancedb` | `0.31.0` | Apache-2.0 | [LanceDB](https://github.com/lancedb/lancedb) |
| `apache-arrow` | `18.1.0` | Apache-2.0 | [Apache Arrow](https://github.com/apache/arrow) |
| `electron-updater` | `6.8.9` | MIT | [electron-builder](https://github.com/electron-userland/electron-builder) |
| `lucide-react` | `1.21.0` | ISC | [Lucide](https://github.com/lucide-icons/lucide) |
| `qrcode` | `1.5.4` | MIT | [node-qrcode](https://github.com/soldair/node-qrcode) |
| `react` | `19.2.7` | MIT | [React](https://github.com/facebook/react) |
| `react-dom` | `19.2.7` | MIT | [React](https://github.com/facebook/react) |
| `electron` | `43.2.0` | MIT | [Electron](https://github.com/electron/electron) |

`electron` 位于开发依赖中，但 Electron 二进制会随桌面安装包分发，因此也列入运行时清单。

## 安装包中的本地运行时

| 组件 | 当前来源 / 版本 | 许可证与发布要求 |
| --- | --- | --- |
| `whisper.cpp` | `v1.9.1`，由发布工作流从 [ggml-org/whisper.cpp](https://github.com/ggml-org/whisper.cpp) 构建 | MIT；发布包需要保留其版权和许可证声明。 |
| FFmpeg / FFprobe | 各平台构建机提供，具体版本由构建日志确定 | FFmpeg 基线为 LGPL-2.1-or-later，但启用 GPL 组件后整体义务会变化；发布前必须以 `ffmpeg -version` 的 configuration 为准，不得笼统宣称为纯 LGPL。详见 [FFmpeg legal](https://ffmpeg.org/legal.html)。 |
| `libheif` 工具 | `1.23.1`，由发布工作流从 [strukturag/libheif](https://github.com/strukturag/libheif) 构建 | libheif 为 LGPL；示例工具另有 MIT 许可，发布包需要同时保留对应声明。 |
| SigLIP2 模型文件 | `google/siglip2-base-patch16-224` 的 ONNX 转换文件 | Apache-2.0；模型卡和来源见 [Hugging Face model card](https://huggingface.co/google/siglip2-base-patch16-224)。 |

运行时二进制不是仓库中的源代码副本；`resources/` 中的产物由发布工作流按固定版本构建或暂存。任何更换编解码器、FFmpeg 构建参数、模型来源或运行时版本的改动，都必须重新审计本表和发布包内的许可证文件。

## 参考项目（仅功能研究，不作为依赖）

| 项目 | 已读取的许可 | AIVPlayer 当前处理 |
| --- | --- | --- |
| [OpenList](https://github.com/OpenListTeam/OpenList) | AGPL-3.0 | 仅参考文件管理 / 预览交互；不复制其代码、品牌或资源，不作为 AIVPlayer 依赖。 |
| [VLC](https://github.com/videolan/vlc) | VLC 主仓库 GPL-2.0-or-later；libVLC 另有 LGPL 许可边界 | 仅参考播放器能力和媒体处理边界；AIVPlayer 当前使用 Electron / HTML5 video / FFmpeg，不嵌入 VLC 代码。 |
| [Pireel Studio](https://github.com/pireel/pireel) | AGPL-3.0-only | 仅参考剪辑器交互和时间线信息组织；不复制其代码、主题素材或商标，不作为 AIVPlayer 依赖。 |

## 发布前检查

- [ ] `npm run check:licenses` 通过，且清单版本与当前安装依赖一致。
- [ ] 打包资源中包含 `LICENSE` 和 `THIRD_PARTY_LICENSES.md`。
- [ ] 记录 FFmpeg 实际版本、configuration、GPL / nonfree 选项和对应许可证文件。
- [ ] 记录 libheif 使用的 codec / plugin 及其许可证；不要只记录 libheif 主库。
- [ ] 记录模型文件的来源、版本 / revision 和模型卡许可证。
- [ ] GitHub 与 Gitee 发布使用同一批已审计的安装包和更新元数据。
