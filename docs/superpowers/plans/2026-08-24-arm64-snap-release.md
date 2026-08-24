# ARM64 Snap Release Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build and automatically publish an ARM64 AIVPlayer Snap to the existing `aivplayer` Snap Store application alongside the existing x86_64 release.

**Architecture:** Extend the existing `build-linux-arm64` GitHub Actions job to run Snapcraft in destructive mode through electron-builder, using the existing `SNAP_CSC_LINK` credential and stable/edge channel policy. Update release artifact contracts and fixtures so ARM64 Snap is required and included in the assembled release without changing the existing x86_64 path.

**Tech Stack:** GitHub Actions, Ubuntu ARM64 runner, electron-builder 26, Snapcraft core24, Snap Store, Node.js/Vitest.

## Global Constraints

- The Snap name remains `aivplayer`; do not register a second Snap name.
- Tag releases automatically publish ARM64 to both `stable` and `edge`, matching the x86_64 workflow.
- Manual `verify_only` runs build ARM64 Snap without publishing.
- ARM64 release contracts require `.AppImage`, `.deb`, `.snap`, and `latest-linux-arm64.yml`.
- The ARM64 Snap must use the existing `SNAP_CSC_LINK` secret; no credentials may be committed.
- Update `FEATURE.md` for the new release capability and `FailureExperience.md` only for verified mistakes or lessons.

---

### Task 1: Add ARM64 Snap build and publication

**Files:**
- Modify: `.github/workflows/release.yml:1047-1216`
- Modify: `electron-builder.yml:433-438`
- Test: `tests/unit/release-workflow.test.ts` or the existing release workflow test file that reads `release.yml`

**Interfaces:**
- Consumes: `build-linux-arm64`, `SNAP_CSC_LINK`, `inputs.verify_only`, and the existing `electron-builder.yml` Snapcraft configuration.
- Produces: an ARM64 `release/*.snap` file and a tag-triggered upload to the existing Snap Store `aivplayer` stable/edge channels.

- [ ] **Step 1: Write the failing workflow assertions**

  Add assertions against `release.yml` for the ARM64 job requiring `Install Snapcraft toolchain`, `--linux snap --arm64`, `SNAP_CSC_LINK`, `SNAP_PUBLISH_ENABLED`, `--publish always`, and `release/*.snap` in the ARM64 artifact upload. Add an assertion that the electron-builder comment no longer says Snap is x64-only.

- [ ] **Step 2: Run the focused test and confirm failure**

  Run `npx vitest run tests/unit/release-workflow.test.ts` or the repository's matching release workflow test file. Expected: the new ARM64 Snap assertions fail because the job does not currently contain them.

- [ ] **Step 3: Add the ARM64 Snap build step**

  In `build-linux-arm64`, add the same Snapcraft installation and publish decision used by `build-linux`, then invoke:

  ```bash
  sudo -E env "PATH=$PATH" SNAP_CSC_LINK="$SNAP_CSC_LINK" \
    npx electron-builder --linux snap --arm64 --publish always
  ```

  Use `--publish never` when `SNAP_CSC_LINK` is unavailable or `verify_only` is true. Add `release/*.snap` to the `linux-arm64` artifact upload. Update the comment in `electron-builder.yml` to say Snap is explicitly built for Linux release architectures, not only x64.

- [ ] **Step 4: Run the focused test and confirm it passes**

  Run the focused Vitest file and expect PASS.

- [ ] **Step 5: Commit the workflow change**

  Run `git add .github/workflows/release.yml electron-builder.yml tests/unit/release-workflow.test.ts` and commit with `feat(发布) : 自动发布 ARM64 Snap`.

### Task 2: Require ARM64 Snap in release contracts

**Files:**
- Modify: `scripts/check-platform-release-artifacts.mjs:16-55`
- Modify: `tests/unit/platform-release-artifacts.test.ts:35-70`
- Modify: `tests/unit/platform-evidence.test.ts:13-23`
- Modify: `tests/unit/release-assembly.test.ts:61-81`

**Interfaces:**
- Consumes: ARM64 release directory containing `.AppImage`, `.deb`, `.snap`, and `latest-linux-arm64.yml`.
- Produces: deterministic contract/evidence validation that fails when the ARM64 Snap is absent or has the wrong architecture.

- [ ] **Step 1: Add failing ARM64 contract fixtures and assertions**

  Add an ARM64 Snap name such as `aivplayer-0.5.1-arm64.snap` to complete fixtures and add a test that an ARM64 contract rejects a fixture missing `.snap`.

- [ ] **Step 2: Run the focused contract tests and confirm the intended failure**

  Run `npx vitest run tests/unit/platform-release-artifacts.test.ts tests/unit/platform-evidence.test.ts tests/unit/release-assembly.test.ts`. Expected: the new requirement fails before the implementation changes.

- [ ] **Step 3: Change the ARM64 contract**

  Remove the special-case filtering that excludes `.snap` for ARM64. Keep `latest-linux-arm64.yml` as the ARM64 metadata requirement. Update test fixture evidence package extensions to include `.snap` and include the ARM64 Snap in assembly inputs.

- [ ] **Step 4: Run focused contract tests**

  Run the same three Vitest files and expect PASS.

- [ ] **Step 5: Commit the contract change**

  Commit with `test(发布) : 固化 ARM64 Snap 产物契约`.

### Task 3: Document the supported ARM64 Snap channel

**Files:**
- Modify: `FEATURE.md`
- Modify: `README.md`
- Modify: `README.zh-CN.md`
- Modify: `README.ko-KR.md`
- Modify: `README.ja-JP.md`

**Interfaces:**
- Consumes: the final ARM64 Snap release behavior from Tasks 1 and 2.
- Produces: user-facing installation guidance that accurately states ARM64 Snap availability.

- [ ] **Step 1: Add the feature record**

  Add a concise `ARM64 Snap 发布` entry to `FEATURE.md` describing automatic stable/edge publication and architecture selection by Snap.

- [ ] **Step 2: Add synchronized README installation notes**

  Add a short Linux installation note in all four README files: `sudo snap install aivplayer`, with a statement that Snap selects the current architecture and ARM64 is published automatically. Do not add implementation details or CI credentials.

- [ ] **Step 3: Run documentation consistency checks**

  Run the repository's README/documentation tests if present, then verify all four files contain the same installation command and ARM64 wording.

- [ ] **Step 4: Commit the documentation change**

  Commit with `docs(发布) : 记录 ARM64 Snap 安装方式`.

### Task 4: Verify and publish ARM64 Snap

**Files:**
- No source changes expected unless verification exposes a concrete failure.

**Interfaces:**
- Consumes: the committed workflow and release contract changes.
- Produces: a successful GitHub Actions release run and Snap Store ARM64 channel entries for `aivplayer`.

- [ ] **Step 1: Run the complete local verification suite relevant to release artifacts**

  Run `npx vitest run tests/unit/platform-release-artifacts.test.ts tests/unit/platform-evidence.test.ts tests/unit/release-assembly.test.ts tests/unit/release-downloads.test.ts` and `npm run flatpak:check`.

- [ ] **Step 2: Inspect the diff and scan for secrets**

  Run `git status --short`, `git diff --check`, `git diff`, and scan staged content for API keys, passwords, private keys, and Snap credentials. Stop if any secret is present.

- [ ] **Step 3: Push the commits and trigger the release verification**

  Push to `main`, then use the existing workflow dispatch with `verify_only=true` to build ARM64 Snap without publishing. For the real tag release, the normal tag-triggered workflow publishes both architectures to stable/edge.

- [ ] **Step 4: Verify the ARM64 Snap in the Store**

  Query `snap info aivplayer` on the ARM64 VM and confirm `stable` and `edge` contain an `arm64` channel-map entry. Then run `sudo snap install aivplayer` and launch the app.

- [ ] **Step 5: Record the verification result**

  If the ARM64 run succeeds, update `FEATURE.md` only if the released version is now user-visible. If a concrete failure occurs, record the root cause and fix in `FailureExperience.md` before retrying.
