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

Release workflow 会固定使用 libheif `1.23.1` 源码构建无插件 HEIC 运行时：macOS/Linux 优先使用 BSD 许可的 Kvazaar HEVC 编码器，Windows 使用 vcpkg 静态 triplet 的 x265，构建产物只在 CI 工作区暂存，不提交二进制到 Git。

`npm run dist` runs both `release:check-runtime` and `release:check-heif-runtime` before packaging, so Windows/Linux public releases cannot be built without the local ASR and HEIF runtimes staged; macOS may use the system `sips` fallback.

Use `npm run release:prepare-runtime` to stage runtime files from local or CI-produced binaries:

```shell
npm run release:prepare-runtime -- \
  --whisper-dir /path/to/whisper.cpp/build/bin \
  --ffmpeg-bin /path/to/ffmpeg
```

The script normalizes binary names to the layout above and copies sibling runtime libraries such as `.dylib`, `.so`, `.so.*`, `.dll`, and `.metal` from the whisper.cpp build directory.

On macOS, it also recursively bundles non-system Mach-O dylib dependencies for ffmpeg and ffprobe, rewrites them to `@loader_path` references, applies an ad-hoc signature, and executes both binaries with `-version` before staging succeeds. Do not manually copy `/opt/homebrew/bin/ffmpeg` into this directory: that symlink points to a Homebrew build whose absolute Cellar paths are not portable.

Large Whisper model files are intentionally not stored in this directory. The app downloads models into the user's app data directory so installers stay small and updates remain cheap.
