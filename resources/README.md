# AIVPlayer Bundled Runtime Resources

Release builds should include platform-specific ASR runtime binaries here:

- `resources/whisper.cpp/whisper-cli` on macOS/Linux
- `resources/whisper.cpp/whisper-cli.exe` on Windows
- `resources/ffmpeg/ffmpeg` on macOS/Linux
- `resources/ffmpeg/ffmpeg.exe` on Windows

Live Photo HEIC 封面编辑还需要平台对应的 libheif 命令行运行时：

- `resources/heif/heif-enc` 和 `resources/heif/heif-convert` on macOS/Linux
- `resources/heif/heif-enc.exe` 和 `resources/heif/heif-convert.exe` on Windows

`npm run release:prepare-heif-runtime -- --heif-dir /path/to/self-contained/libheif/bin` 会把两个工具及同目录运行库放入 `resources/heif`；Windows/Linux 发布前必须准备自包含或已携带依赖的 libheif 产物。macOS 优先使用系统 `sips`，因此不需要把 Homebrew 的动态库直接复制进安装包。

Release workflow 会固定使用 libheif `1.23.1` 源码构建无插件 HEIC 运行时：macOS 使用 BSD 许可的 Kvazaar HEVC 编码器，Windows/Linux 使用对应 Runner 的 x265 依赖，构建产物只在 CI 工作区暂存，不提交二进制到 Git。

视觉搜索模型也不提交到 Git。发布前由 `npm run release:prepare-vision-model -- --resource-dir resources` 从固定的 `onnx-community/siglip2-base-patch16-224-ONNX` revision 暂存 `resources/vision/siglip2-base-patch16-224-ONNX`，只下载 electron-builder 配置中列出的 UINT8 文件。

`npm run dist` runs both `release:check-runtime` and `release:check-heif-runtime` before packaging, then writes `resources/runtime-metadata.json`; Windows/Linux public releases cannot be built without the local ASR, HEIF and vision runtimes staged; macOS may use the system `sips` fallback.

Use `npm run release:prepare-runtime` to stage runtime files from local or CI-produced binaries:

```shell
npm run release:prepare-runtime -- \
  --whisper-dir /path/to/whisper.cpp/build/bin \
  --ffmpeg-bin /path/to/ffmpeg
```

The script normalizes binary names to the layout above and copies sibling runtime libraries such as `.dylib`, `.so`, `.so.*`, `.dll`, and `.metal` from the whisper.cpp build directory.

On macOS, it also recursively bundles non-system Mach-O dylib dependencies for ffmpeg and ffprobe, rewrites them to `@loader_path` references, applies an ad-hoc signature, and executes both binaries with `-version` before staging succeeds. Do not manually copy `/opt/homebrew/bin/ffmpeg` into this directory: that symlink points to a Homebrew build whose absolute Cellar paths are not portable.

Large Whisper model files are intentionally not stored in this directory. The app downloads ASR models into the user's app data directory so installers stay small and updates remain cheap. The SigLIP2 vision model is different: it is an application feature dependency and is therefore staged into the installer by the release workflow.

## License files in packaged resources

Electron Builder copies the project `LICENSE`, `docs/THIRD_PARTY_LICENSES.md` and generated `runtime-metadata.json` into the packaged resources directory. `npm run release:check-packaged-resources` treats all three files as required artifacts, so a desktop release cannot pass resource verification without the project, direct runtime license records and build evidence.

`npm run release:write-runtime-metadata` also writes `runtime-metadata.json` into this directory. It records platform, binary SHA-256, FFmpeg version / configuration, whisper.cpp and libheif source versions, the macOS `sips` fallback, and the SigLIP2 model revision plus packaged-file hashes. The file is ignored by Git and is copied into each installer by electron-builder.
