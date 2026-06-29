# AIVPlayer Bundled Runtime Resources

Release builds should include platform-specific ASR runtime binaries here:

- `resources/whisper.cpp/whisper-cli` on macOS/Linux
- `resources/whisper.cpp/whisper-cli.exe` on Windows
- `resources/ffmpeg/ffmpeg` on macOS/Linux
- `resources/ffmpeg/ffmpeg.exe` on Windows

`npm run dist` runs `npm run release:check-runtime` before packaging, so a public release cannot be built without the local ASR runtime staged.

Use `npm run release:prepare-runtime` to stage runtime files from local or CI-produced binaries:

```shell
npm run release:prepare-runtime -- \
  --whisper-dir /path/to/whisper.cpp/build/bin \
  --ffmpeg-bin /path/to/ffmpeg
```

The script normalizes binary names to the layout above and copies sibling runtime libraries such as `.dylib`, `.so`, `.so.*`, `.dll`, and `.metal` from the whisper.cpp build directory.

Large Whisper model files are intentionally not stored in this directory. The app downloads models into the user's app data directory so installers stay small and updates remain cheap.
