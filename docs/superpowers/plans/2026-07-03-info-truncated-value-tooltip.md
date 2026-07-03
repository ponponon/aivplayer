# Info Truncated Value Tooltip Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let truncated media info values reveal their complete string on hover without changing the compact side-panel layout.

**Architecture:** Keep the current compact card grid and add a project-controlled hover/focus tooltip for truncated values. The first native `title` attempt was not visually reliable enough in Electron, so the final implementation uses an `InfoValue` component plus CSS pseudo-elements fed by `data-tooltip`.

**Tech Stack:** Electron, React 19, TypeScript, CSS in `src/renderer/src/styles/player.css`, Vitest/TypeScript checks.

---

### Revision Note

The initial low-cost `title` approach was superseded after manual feedback showed no visible tooltip. The final implementation should use `src/renderer/src/app/info-value.tsx`, `tests/unit/info-value.test.ts`, and `.info-value` styles in `src/renderer/src/styles/player.css`.

### Context Map

**Existing behavior**
- `src/renderer/src/styles/player.css:467` makes `.info-grid.compact .info-item strong` a single-line ellipsis value with `overflow: hidden`, `text-overflow: ellipsis`, and `white-space: nowrap`.
- `src/renderer/src/app/App.tsx:1872-1886` renders compact media summary values such as container format, file size, duration, and bitrate, but only the file name, full path, and media URL currently have `title`.
- `src/renderer/src/app/media-details-dialog.tsx:140` already uses `<strong title={formatDetailValue(entry.value)}>` for long ffprobe values.
- `src/renderer/src/app/settings-dialog.tsx:350` and `src/renderer/src/app/settings-dialog.tsx:752` already use `title` for truncated path values.

**Files**
- Modify: `src/renderer/src/app/App.tsx`
- Create: `src/renderer/src/app/info-value.tsx`
- Modify: `src/renderer/src/styles/player.css`
- Create: `tests/unit/info-value.test.ts`
- Modify: `FEATURE.md`
- Modify: `FailureExperience.md`
- No icon change required.

---

### Task 1: Add Reusable Info Value Rendering

**Files:**
- Modify: `src/renderer/src/app/App.tsx`

- [ ] **Step 1: Add a tiny helper component near the existing formatter helpers**

Add this after `type AsrNotice` and before `getPlayFailureMessage`:

```tsx
type InfoValueProps = {
  value: string
  title?: string
}

function InfoValue(props: InfoValueProps): ReactElement {
  const { value, title = value } = props

  return <strong title={title}>{value}</strong>
}
```

- [ ] **Step 2: Add derived labels for values that are currently rendered inline**

Inside `App`, near the other derived media labels around `mediaAudioBitrateLabel`, add:

```tsx
  const playbackPositionInfoLabel = `${formatTime(state.currentTime)} / ${playbackTimeLabel}`
  const playbackSpeedInfoLabel = `${state.playbackRate}x`
  const playbackVolumeInfoLabel = `${Math.round((state.muted ? 0 : state.volume) * 100)}%`
  const subtitleVttStatusLabel = subtitlePath ? copy.panels.subtitleStatusCached : copy.panels.subtitleStatusIdle
  const subtitleSrtStatusLabel = subtitleSrtPath ? copy.panels.subtitleStatusCached : copy.panels.subtitleStatusIdle
```

- [ ] **Step 3: Replace compact `strong` values in the current file card**

Change this block in `src/renderer/src/app/App.tsx`:

```tsx
<strong>{mediaContainerLabel}</strong>
<strong>{mediaFileSizeLabel}</strong>
<strong>{mediaDurationLabel}</strong>
<strong>{mediaOverallBitrateLabel}</strong>
```

to:

```tsx
<InfoValue value={mediaContainerLabel} />
<InfoValue value={mediaFileSizeLabel} />
<InfoValue value={mediaDurationLabel} />
<InfoValue value={mediaOverallBitrateLabel} />
```

- [ ] **Step 4: Replace compact `strong` values in the video stream card**

Change:

```tsx
<strong>{mediaResolutionLabel}</strong>
<strong>{mediaFrameRateLabel}</strong>
<strong>{mediaVideoCodecLabel}</strong>
<strong>{mediaAspectRatioLabel}</strong>
```

to:

```tsx
<InfoValue value={mediaResolutionLabel} />
<InfoValue value={mediaFrameRateLabel} />
<InfoValue value={mediaVideoCodecLabel} />
<InfoValue value={mediaAspectRatioLabel} />
```

- [ ] **Step 5: Replace compact `strong` values in the audio stream card**

Change:

```tsx
<strong>{mediaAudioCodecLabel}</strong>
<strong>{mediaAudioChannelsLabel}</strong>
<strong>{mediaAudioSampleRateLabel}</strong>
<strong>{mediaAudioBitrateLabel}</strong>
```

to:

```tsx
<InfoValue value={mediaAudioCodecLabel} />
<InfoValue value={mediaAudioChannelsLabel} />
<InfoValue value={mediaAudioSampleRateLabel} />
<InfoValue value={mediaAudioBitrateLabel} />
```

- [ ] **Step 6: Replace compact `strong` values in playback and subtitle status cards**

Change the playback card values to:

```tsx
<InfoValue value={playbackPositionInfoLabel} />
<InfoValue value={playbackSpeedInfoLabel} />
<InfoValue value={playbackVolumeInfoLabel} />
<InfoValue value={subtitleStatusLabel} />
```

Change the subtitle cache card values to:

```tsx
<InfoValue value={subtitleVttStatusLabel} title={subtitlePath ?? subtitleVttStatusLabel} />
<InfoValue value={subtitleSrtStatusLabel} title={subtitleSrtPath ?? subtitleSrtStatusLabel} />
```

Expected result: any compact value that is visually shortened by ellipsis exposes its complete value through hover. VTT/SRT cache rows show the actual cached path on hover when a path exists, which is more useful than repeating "cached".

---

### Task 2: Keep Existing Long-Text Behavior Intact

**Files:**
- Modify: `src/renderer/src/app/App.tsx`

- [ ] **Step 1: Leave existing full text fields unchanged**

Do not change these existing fields because they already expose complete text:

```tsx
<strong title={state.currentFile.name}>{state.currentFile.name}</strong>
<strong title={state.currentFile.path}>{state.currentFile.path}</strong>
<strong title={state.currentFile.url}>{state.currentFile.url}</strong>
```

- [ ] **Step 2: Do not add a custom CSS tooltip in this pass**

Reason: `.info-stack` uses `overflow-y: auto`, so CSS pseudo-element tooltips can be clipped by the scroll container. A native `title` avoids clipping, matches existing code, and solves the immediate issue with almost no layout risk.

---

### Task 3: Document the Feature

**Files:**
- Modify: `FEATURE.md`

- [ ] **Step 1: Add one bullet under `## 媒体信息`**

Add:

```markdown
- 媒体信息摘要卡片里的被截断字段支持鼠标悬停查看完整内容，封装格式、编码、播放状态和字幕缓存路径都不会因为侧栏窄而丢信息。
```

---

### Task 4: Verify

**Files:**
- No source edit.

- [ ] **Step 1: Run TypeScript check**

Run:

```bash
npm run typecheck
```

Expected: PASS.

- [ ] **Step 2: Run focused app smoke check**

Run:

```bash
npm run dev
```

Manual check:
- Open the sample video shown in the screenshot.
- Switch to `媒体信息`.
- Hover `封装格式`.
- Expected: tooltip shows the complete string, for example `QuickTime / MOV`.
- Hover video/audio codec fields and playback position.
- Expected: each complete value is available on hover while the card grid keeps its current size.

- [ ] **Step 3: Confirm no style regression**

Check:
- Compact cards remain two columns.
- No text overlaps neighboring cards.
- Full path and media URL still wrap as before.
- The "查看完整详情" button layout is unchanged.

---

### Optional Future Task: Styled Tooltip Component

Only do this if native `title` feels too plain or too slow in Electron.

**Files:**
- Create: `src/renderer/src/app/truncated-text.tsx`
- Modify: `src/renderer/src/app/App.tsx`
- Modify: `src/renderer/src/styles/player.css`

Implementation note:
- Use a React component that measures `scrollWidth > clientWidth` before showing a custom tooltip.
- Render the tooltip outside `.info-stack` through a fixed-position portal or a top-level overlay to avoid clipping by `overflow-y: auto`.
- Add keyboard access through `onFocus` / `onBlur`, not hover-only.

Do not start here unless product polish requires it; the first pass gives the best cost-to-value ratio.
