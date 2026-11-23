/**
 * GPU 开关的平台策略
 *
 * Linux 上不主动开启 GPU 加速，这是产品决定，不是遗漏的性能优化点：
 * - Chromium 的 GPU 合成在 Wayland 会话下会出现花屏、黑屏、整窗闪烁，
 *   混合显卡 / NVIDIA 私有驱动上尤其明显，用户会直接看到"软件坏了"。
 * - 即使把开关打开，Electron 在 Linux 上默认也不启用 VAAPI 硬解（需要额外的
 *   `--enable-features=VaapiVideoDecoder` 与 GPU blocklist 处理），所以收益只有
 *   界面合成，付出的却是 Wayland 稳定性。
 * - 关闭 GPU 合成时播放链路仍然可用，只是 CPU 占用更高；配套做法是限制后台
 *   FFmpeg 的线程数，而不是打开 GPU。
 *
 * 因此不要在 Linux 上推荐用户去开它，也不要把 "Linux 播放 CPU 高" 归因成这个开关忘了开。
 * 相关背景见 FEATURE.md 的"视频设置"条目与 FailureExperience.md 的 GPU 记录。
 *
 * Windows / macOS 保持默认开启，那里的 GPU 合成与硬解是稳定且有收益的。
 */
export const GPU_DISABLE_SWITCHES = ['disable-gpu', 'disable-gpu-compositing'] as const

export function shouldDisableGpu(options: { forceDisable: boolean; gpuAcceleration: boolean }): boolean {
  return options.forceDisable || !options.gpuAcceleration
}
