<p align="center">
  <img src="brand/icon.png" width="120" alt="AIVPlayer Logo">
</p>

<h1 align="center">AIVPlayer</h1>

<p align="center">
  <strong>Local-first AI video workstation for playback, subtitles, visual media libraries, and short-drama creation</strong>
</p>

<p align="center">
  <a href="https://aivplayer.pages.dev/">Product site</a> ·
  <a href="https://github.com/ponponon/aivplayer/releases">Download from GitHub</a>
</p>

<p align="center">
  <a href="https://github.com/ponponon/aivplayer/releases">
    <img src="https://img.shields.io/github/v/release/ponponon/aivplayer" alt="Release">
  </a>
  <a href="https://github.com/ponponon/aivplayer/blob/main/LICENSE">
    <img src="https://img.shields.io/github/license/ponponon/aivplayer" alt="License">
  </a>
  <img src="https://img.shields.io/badge/platform-macOS%20%7C%20Windows%20%7C%20Linux-blue" alt="Platform">
</p>

<p align="center">
  <a href="#quick-start">Quick start</a> ·
  <a href="#features">Features</a> ·
  <a href="#command-line-interface">CLI</a> ·
  <a href="#development-from-source">Development</a> ·
  <a href="#troubleshooting">Troubleshooting</a> ·
  <a href="#contributing">Contributing</a>
</p>

<p align="center">
  <a href="README.md">English</a> ·
  <a href="README.zh-CN.md">简体中文</a> ·
  <a href="README.ja-JP.md">日本語</a> ·
  <a href="README.ko-KR.md">한국어</a>
</p>

---

## About

AIVPlayer is a cross-platform Electron desktop video workstation. It brings local video playback, offline ASR subtitles, subtitle translation, AI content summaries, visual media libraries, image processing, and AI short-drama text creation into one application.

The product overview, feature demos, and download links are available at **[aivplayer.pages.dev](https://aivplayer.pages.dev/)**. Download desktop installers from [GitHub Releases](https://github.com/ponponon/aivplayer/releases).

### Local-first architecture and AI request boundaries

- Playback, media parsing, subtitle caches, visual-library indexing, and most processing happen locally.
- ASR uses the local [whisper.cpp](https://github.com/ggerganov/whisper.cpp) engine; videos do not need to be uploaded to an online transcription service.
- Subtitle translation, content summaries, and AI short-drama text generation require an OpenAI-compatible service. When enabled, the relevant text is sent to the provider you configure.
- The visual media library uses a local SigLIP2 model and LanceDB for indexes; original videos and images are not uploaded.

### Code signing policy

The release signing process is documented in the [Code signing policy](CODE_SIGNING_POLICY.md).

> Free code signing provided by [SignPath.io](https://signpath.io/), certificate by [SignPath Foundation](https://signpath.org/)

## Quick start

### 1. Download and install

Visit the [product site](https://aivplayer.pages.dev/) for an overview, or download an installer for your platform from:

- [GitHub Releases](https://github.com/ponponon/aivplayer/releases)

macOS, Windows, and Linux are supported. See [Installation](#installation) for package formats and how to install the `aivcli` command.

### 2. Open a video

After installation, drag a video into the window or use the file picker. The player supports playlists, playback history, resume, subtitle tracks, clip export, screenshots, and screen recording.

### 3. Generate local subtitles for the first time

Open the subtitle panel and follow the guide to prepare the whisper.cpp runtime and an ASR model. Models can be downloaded from ModelScope or Hugging Face. Choose a language and generate subtitles; the result is cached locally and can be reused the next time you open the same video.

### 4. Configure cloud AI when needed

For subtitle translation, content summaries, or the AI Short-Drama Studio, configure an OpenAI-compatible API in Settings or the relevant panel. API keys are stored securely on the local device. `provider show/test` in the CLI only displays redacted status and does not accept a key as a command-line argument.

## Features

### Playback and media processing

- Supports common and professional video formats including MP4, WebM, MOV, MKV, AVI, FLV, WMV, MPEG-TS, 3GP, VOB, MXF, RMVB, MPEG elementary streams, F4V, OGM, NUT, DV, GXF, CAVS, Dirac, R3D, WTV, FLI/FLC, RoQ, Smacker, Motion JPEG, Bink, Y4M, and raw H.264/H.265 streams; incompatible media can be transcoded automatically, with drag-and-drop opening and playlists.
- Supports LAN-only Web playback through Chrome, Firefox, Safari, or a mobile browser. Access shared playlists and selected directories from the desktop app; media is streamed with HTTP Range requests, directories can be refreshed to discover new files, and multi-homed devices show all available addresses with a local QR code. Phones and tablets can add the page to their home screen.
- The LAN Web media library supports directory trees, search, sorting, favorites, and multi-selection. Download selected files in batches or package the current directory as a ZIP while preserving its directory structure.
- LAN Web directory scanning also supports common image formats. Images can be previewed, favorited, copied as links, or downloaded in list/grid media libraries, sharing directory browsing and batch actions with videos.
- The LAN Web interface provides a session task center for queued, active, completed, and failed video transcodes. Failed tasks can be retried directly, and selecting a task returns to its media.
- Browser-incompatible media can be transcoded on demand to H.264 + AAC MP4 locally. Source files are not modified, and results are cached by the source-file fingerprint.
- Transcoding requests from multiple LAN devices are queued according to the local concurrency limit, preventing several large videos from exhausting system resources at once.
- Cache disk space is checked before transcoding. Expired results and temporary files left by abnormal exits are cleaned automatically, and replacing a source file cannot accidentally reuse an old compatible version.
- Playback history is stored locally with resume, unfinished-item filtering, invalid-file cleanup, and context-menu actions. Playback state is stored by media fingerprint, so a replaced file cannot reuse the wrong progress.
- Supports subtitle tracks, volume, playback speed, fullscreen, keyboard shortcuts, and automatic control-bar hiding. End-of-playback behavior can stop, play the next item, loop the current item, loop the playlist, or shuffle; container chapters and user bookmarks can be selected directly from the timeline.
- Export 15-, 30-, or 60-second clips as video only, with an external subtitle file, or with burned-in subtitles.
- Capture screenshots, record the screen on a timer, and export GIFs with configurable directories, formats, and naming rules.
- Inspect media details such as duration, resolution, codecs, frame rate, bitrate, audio tracks, and subtitle tracks.

### Local AI subtitles and content understanding

- Local ASR powered by whisper.cpp, with multilingual recognition including Chinese, English, Japanese, and Korean.
- Generate VTT and SRT together, with subtitle caching, a default language, timeline adjustment, and generation-status visibility.
- Translate subtitles through an OpenAI-compatible service with caching, retries, cancellation, a glossary, and target-language switching.
- Generate AI content summaries, including spoiler-free and detailed summaries, chapters, timeline jumps, and Markdown, TXT, or JSON export.
- AI workflows support guided or one-shot processing with caching, cancellation, retries, and resume.

### Visual media library

- Use a local SigLIP2 model to sample video frames at intervals and store vectors in a local LanceDB database.
- Search by text description, image, or a hybrid of text, visual, and filename signals.
- Search results can show matching subtitle snippets and jump directly to the corresponding point in the video.
- Optionally detect FFmpeg scene changes and index bounded scene-segment evidence; this is off by default so ordinary indexing and local imports do not decode each video twice.
- Optionally generate fixed-vocabulary zero-shot entity labels with the local SigLIP2 model (people, vehicles, animals, bags, cameras, computers, smartphones, indoor/outdoor, and more); no network, identity recognition, or bounding-box detection, and off by default.
- Provides a local entity-label catalog for creating custom query labels, renaming, aliases, hiding, and merging labels; the catalog stays in the user data directory and is applied to the next entity index and search results.
- Supports recursive directory scanning, incremental indexing, a background indexing queue, automatic playlist scanning, and index progress/phase-duration reporting.
- Loading more search results uses a short-lived local snapshot cursor, so repeated pages do not rerun the query against a changing index; snapshots are capped at 100 results and are not persisted or uploaded.
- Export the current visual search window or selected results as JSON or CSV with source paths, exact time ranges, evidence types, match text, confidence, and object boxes; media files are never copied.
- Export the full library for the active text, image, or similar-shot query as JSON or CSV; the full pass is locally recomputed with deterministic score/ID ordering and is capped at one million indexed results.
- Full-library exports run in the background Task Center with search/write progress and cancellation; JSON/CSV is written in chunks to a temporary file and atomically finalized, so cancellation or failure does not leave a partial export.
- The CLI can also scan, index, inspect status, and search, making it suitable for maintaining a personal video library in batches.

### AI Short-Drama Studio

- Create short-drama projects and identify chapters from TXT or Markdown novels for repeated import.
- Generate story events, story skeletons, adaptation strategies, and episode scripts; stage results are stored in local SQLite.
- Extract character, scene, and prop assets from scripts and generate structured storyboards.
- Supports OpenAI-compatible providers, a local mock, connection tests, task status, caching, and resume.
- Provides an independent image/video/audio generation task queue with queued, running, progress, completed, failed, and cancelled states. Interrupted running tasks return to the queue after an app restart.
- Completed results with a local path can flow back into the currently open editing timeline, reusing existing media sources, main-track insertion, undo/redo, and project persistence. No timeline is changed when no editing project is open.
- The current focus is text planning and storyboard outlines; no specific image or video generation vendor is wired in yet.

### Image workspace

- Import multiple images and crop, rotate, flip, or process them in batches.
- Configure format, quality, target-size compression, batch export, and overwrite policies.

### Languages and interface

- Supports Simplified Chinese, English, Japanese, and Korean.
- Dark cinema-style interface with an auto-hiding control bar and layouts that adapt to different window sizes.
- macOS uses native window controls; Windows and Linux use custom controls that follow the application theme.

## Command-line interface

Installers provide the `aivcli` command. The CLI shares ASR, subtitle-cache, visual-library, and AI short-drama data with the desktop app. Start by checking the local runtime:

```bash
aivcli doctor
aivcli doctor --json
```

### Media and subtitles

```bash
aivcli media info ./movie.mp4
aivcli asr ./movie.mp4 --format both --output-dir ./subtitles
aivcli subtitle convert ./movie.vtt
aivcli subtitle translate ./movie.vtt --to zh --output-dir ./subtitles
```

### Read-only editing-project queries

`aivcli edit` does not modify projects, media, or subtitle files. `inspect` outputs a reviewable timeline and subtitle summary, `captions` searches script lines by source or translated text while retaining lines marked as deleted, and `propose` only generates a structured plan with the project revision so a human can review it before a future confirmation flow:

```bash
aivcli edit inspect ./project.aivproj --json
aivcli edit captions ./project.aivproj --query "remove pause" --limit 20 --json
aivcli edit propose delete-script ./project.aivproj segment-1 segment-2 --json
```

`edit propose delete-script` outputs source intervals to delete, intervals to keep, affected script lines, subtitle changes, and the estimated duration. The proposal uses the project snapshot fingerprint for stale checks; the CLI currently only produces JSON and does not write back to `.aivproj`.

When the desktop editor deletes script lines, it first opens the same proposal preview and only writes to edit history and the local project cache after confirmation. Hold Shift to multi-select script lines and generate one batch proposal. If the project changes before confirmation, the application rejects the operation and asks for a new proposal.

### Local editing MCP

A fixed project can be exposed to an Agent through a local stdio MCP server. The default server exposes only the three read-only tools `inspect`, `captions`, and `propose delete-script`; it does not listen on a network port and cannot apply proposals, write files, delete media, or run shell commands:

```bash
aivcli mcp serve ./project.aivproj
```

Example MCP client configuration:

```json
{
  "mcpServers": {
    "aivplayer-editing": {
      "command": "aivcli",
      "args": ["mcp", "serve", "/absolute/path/project.aivproj"]
    }
  }
}
```

The project path is fixed when the server starts, so an Agent cannot switch to another file through tool arguments. Applying changes still requires returning to the desktop confirmation dialog and passing the project-revision check.

To connect a trusted local Agent to the open desktop editor, add `--desktop`:

```bash
aivcli mcp serve ./project.aivproj --desktop
```

Desktop mode uses a per-user local Unix socket (Windows named pipe) with a rotating token. A proposal is accepted only when the matching `.aivproj` is open, then appears in the existing confirmation dialog; reject, stale, cancel, and timeout outcomes are returned to the Agent. The bridge never exposes a direct apply tool, network listener, arbitrary file access, media deletion, shell execution, or provider credentials. Use `--bridge-manifest path` only when the desktop app and CLI intentionally use different user-data directories.

### Visual media library

```bash
aivcli library status
aivcli library scan ./Videos --recursive
aivcli library index ./Videos --recursive
aivcli library search "seaside scene"
aivcli library search --image ./reference.jpg
```

### Batch processing

```bash
aivcli batch ./Videos --recursive --asr --translate zh --index --output-dir ./subtitles
aivcli batch ./Videos --recursive --asr --translate zh --index --resume
```

`batch` combines ASR, subtitle translation, and visual-library indexing. By default, it continues after an individual video fails and saves state in the AIVPlayer user-data directory. Use `--state-file ./batch-state.json` to choose a state file, `--retry 0..5` to adjust retries for recoverable errors, or `--fail-fast` to stop immediately on an error. After an interruption, rerun the same arguments with `--resume`; completed stages whose artifacts still exist are skipped.

If `--translate` is specified without `--asr`, the CLI reads a same-named `.vtt` file beside the video. With `--output-dir`, translated subtitles receive a target-language suffix such as `movie.zh.vtt` and do not overwrite the source subtitles. Major commands support `--json` for shell, CI, and other automation.

### AI short dramas

```bash
aivcli drama list
aivcli drama create "My short drama" --genre "Mystery" --episodes 6
aivcli drama import <project-id> ./novel.txt
aivcli drama events generate <project-id>
aivcli drama plan generate <project-id> --stage skeleton
aivcli drama script generate <project-id> --episode 1
aivcli drama assets generate <project-id>
aivcli drama storyboard generate <project-id> --episode 1
aivcli drama provider show
aivcli drama provider test
```

Run `aivcli --help`, `aivcli batch --help`, or `aivcli drama --help` for all options.

## Installation

### System requirements

- **macOS**: 12.0 or later
- **Windows**: Windows 10 or later
- **Linux**: Ubuntu 18.04 or an equivalent distribution

### Download installers

Download a package for your platform from [GitHub Releases](https://github.com/ponponon/aivplayer/releases):

| Platform | Package |
| --- | --- |
| macOS | `.dmg` / `.zip` / `.pkg` |
| Windows | `.exe` (NSIS installer) |
| Linux | `.AppImage` / `.deb` |

Windows NSIS, macOS `.pkg`, and Linux `.deb` install the `aivcli` launcher and add it to the system command path. macOS `.dmg` / `.zip` and Linux `.AppImage` are portable formats and do not modify PATH automatically; with a portable package, launch the app in `--cli` mode or create a command-line launcher yourself.

### Automatic updates

After launch, official Windows and Linux installers check GitHub Releases in the background and download a new version for the current platform. When the download finishes, a “Restart and update” button appears at the top of the window; installation only begins after clicking it and does not forcibly interrupt playback or editing. macOS does not currently enable automatic updates because Apple Developer ID signing and notarization are not configured, so updates must be downloaded manually from GitHub. Development mode and `aivcli` do not participate in automatic updates.

Automatic updates depend on the `latest*.yml` metadata and corresponding installer/update packages on the GitHub release page, so the release process must upload all of them.

### Build from source

```bash
git clone https://github.com/ponponon/aivplayer.git
cd aivplayer
npm install
npm run dev
```

Node.js 22.12.0 or later is required. Some network environments need a proxy to access npm, ModelScope, or Hugging Face.

## Troubleshooting

### The app started from “Open With” reports `Cannot find module 'apache-arrow'`

This was a startup issue in older installers that did not package LanceDB’s runtime dependency. It is not caused by the video filename, an external-drive path, or MP4 encoding; the current `v0.5.4` release includes the fix. Download the installer from the relevant Release and do not install npm dependencies manually inside the app bundle.

The current release is `v0.5.4`; prefer the installer from that Release.

### Subtitle generation fails

Run:

```bash
aivcli doctor
```

In a source-development environment, also check the backend and ASR runtimes separately:

```bash
npm run doctor:backend
npm run doctor:asr
```

Confirm that whisper.cpp, an ASR model, and ffmpeg are ready. If GPU initialization fails on macOS, the app automatically falls back to CPU for recognized Metal resource errors.

### Translation, summaries, or short-drama generation fails

Confirm that the OpenAI-compatible endpoint, model, and key are correct, then run a connection test in the relevant panel. Never paste an API key into an Issue, screenshot, terminal command, or commit. When reporting a problem, redact the URL, key, path, and complete response first.

### Include these details when reporting a problem

- Operating system, AIVPlayer version, and installer format;
- Reproduction steps, video format, and whether an external drive was used;
- A redacted `aivcli doctor --json` result;
- The panel or CLI command where the error occurred, plus log excerpts with the key removed.

Open an issue in [GitHub Issues](https://github.com/ponponon/aivplayer/issues), or check the [product site](https://aivplayer.pages.dev/) for the latest features and downloads.

## Development from source

### Common commands

```bash
npm run dev              # Start development mode
npm run build            # Build the production version
npm run preview          # Preview the build
npm run pack             # Package without creating an installer
npm run dist             # Create installers

npm run typecheck        # Run the TypeScript type check
npm run test             # Run unit tests
npm run doctor:backend   # Check backend dependencies
npm run doctor:asr       # Check the ASR runtime
npm run smoke:all        # Run the main UI regression suite
npm run smoke:web-format-matrix -- --ffmpeg /path/to/ffmpeg  # Real media-format and Web-transcode matrix
npm run smoke:web-concurrency -- --ffmpeg /path/to/ffmpeg     # Multi-client concurrency, deduplication, and transcode queue smoke
npm run smoke:web-real-file -- ./movie.mp4                     # Real large-file duration, tail Range, and packaged Web smoke
```

Prepare a local ASR runtime:

```bash
npm run release:prepare-runtime -- \
  --whisper-dir /path/to/whisper.cpp/build/bin \
  --ffmpeg-bin /path/to/ffmpeg
```

### Project structure

```text
aivplayer/
├── src/
│   ├── desktop/         # Electron main process and desktop integration
│   ├── core/            # Business capabilities shared by desktop and CLI
│   │   ├── ai/          # ASR, translation, summaries, and visual library
│   │   ├── drama/       # AI short-drama text workflow
│   │   └── media/       # Media parsing and export
│   ├── preload/         # IPC bridge
│   ├── renderer/        # React renderer process
│   └── shared/          # Shared types
├── resources/           # whisper.cpp, ffmpeg, and other runtime resources
├── scripts/             # Build, diagnostics, and smoke tools
├── tests/               # Unit and integration tests
└── docs/
    ├── site/            # Cloudflare Pages product site
    └── ...              # Release and project documentation
```

### Technology stack

| Category | Technology |
| --- | --- |
| Desktop framework | Electron |
| Frontend framework | React 19 |
| Build tools | Vite + electron-vite |
| Type system | TypeScript |
| Local ASR | whisper.cpp |
| Visual search | SigLIP2 + LanceDB + Apache Arrow |
| AI interface | OpenAI-compatible Provider |
| Testing | Vitest + Playwright |
| Packaging | electron-builder |

## Contributing

Issues and pull requests are welcome. Please read `FEATURE.md` and `FailureExperience.md` first to understand the feature boundaries and lessons already recorded in the project.

1. Fork the repository.
2. Create a feature branch, for example `git switch -c feat/amazing-feature`.
3. Run the local type check and relevant tests.
4. Use [Conventional Commits](https://www.conventionalcommits.org/) for your changes.
5. Push the branch and open a pull request.

Common commit types include `feat`, `fix`, `docs`, `refactor`, `test`, and `chore`. Record new features in `FEATURE.md`; when a fix is prompted by feedback, record the reusable lesson in `FailureExperience.md`.

## License

This project is released under the [MIT License](LICENSE).

## Acknowledgements

- [whisper.cpp](https://github.com/ggerganov/whisper.cpp) — local speech-recognition engine
- [Electron](https://electronjs.org/) — cross-platform desktop application framework
- [React](https://react.dev/) — UI framework
- [LanceDB](https://github.com/lancedb/lancedb) — local vector database
- [lucide-react](https://lucide.dev/) — icon library

<p align="center">
  If AIVPlayer is useful to you, visit the <a href="https://aivplayer.pages.dev/">product site</a> or give the repository a ⭐ Star.
</p>
