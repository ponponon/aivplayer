export const GPU_DISABLE_SWITCHES = ['disable-gpu', 'disable-gpu-compositing'] as const

export function shouldDisableGpu(options: { forceDisable: boolean; gpuAcceleration: boolean }): boolean {
  return options.forceDisable || !options.gpuAcceleration
}
