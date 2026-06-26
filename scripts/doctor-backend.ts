import { getNativePlayerStatus } from '../src/main/media/native-player.ts'

async function main(): Promise<void> {
  const status = await getNativePlayerStatus()

  console.log('AIVPlayer Native Playback Doctor')
  console.log(`Backend: ${status.backend}`)
  console.log(`Available: ${status.available ? 'yes' : 'no'}`)
  console.log(`Binary: ${status.binaryPath ?? 'not found'}`)
  console.log(`Version: ${status.version ?? 'unknown'}`)
  console.log(`Message: ${status.message}`)
}

void main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
