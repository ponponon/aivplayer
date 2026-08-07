import { describe, expect, it } from 'vitest'
import { createLocalOcrOperation, createLocalTtsOperation, probeLocalEvidenceCapabilities, type EvidenceCommandRunner } from '../../src/core/ai/local-evidence-adapters'
import { createMediaEvidenceTask } from '../../src/core/ai/evidence-task'

function createCommandRecorder(responses: Record<string, { stdout?: string; stderr?: string }> = {}): { run: EvidenceCommandRunner; calls: Array<{ command: string; args: readonly string[] }> } {
  const calls: Array<{ command: string; args: readonly string[] }> = []
  const run: EvidenceCommandRunner = async (command, args) => {
    calls.push({ command, args })
    const response = responses[command]
    if (!response) throw new Error(`missing fake response: ${command}`)
    return { stdout: response.stdout ?? '', stderr: response.stderr ?? '' }
  }
  return { run, calls }
}

describe('local OCR and TTS adapters', () => {
  it('extracts one frame and sends it to Tesseract without shell interpolation', async () => {
    const recorder = createCommandRecorder({ ffmpeg: {}, tesseract: { stdout: '  画面文字\n' } })
    const task = createMediaEvidenceTask({ kind: 'ocr', mediaPath: '/tmp/video with spaces.mp4', sourceFingerprint: 'video:1', inputHash: 'frames:1', ranges: [{ startSeconds: 1.23456, endSeconds: 2 }] }, 100)
    const artifact = await createLocalOcrOperation({ ffmpegPath: 'ffmpeg', tesseractPath: 'tesseract', language: 'chi_sim', runCommand: recorder.run })({ task, range: task.ranges[0]!, rangeIndex: 0, totalRanges: 1 }, new AbortController().signal)

    expect(artifact).toMatchObject({ artifactType: 'ocr-evidence', text: '  画面文字\n', frameId: `${task.id}:0` })
    expect(recorder.calls[0]).toMatchObject({ command: 'ffmpeg', args: expect.arrayContaining(['-ss', '1.235', '/tmp/video with spaces.mp4']) })
    expect(recorder.calls[1]).toMatchObject({ command: 'tesseract', args: expect.arrayContaining(['stdout', '--psm', '6', '-l', 'chi_sim']) })
  })

  it('requires input text and creates a deterministic macOS say output path', async () => {
    const recorder = createCommandRecorder({ say: {} })
    const task = createMediaEvidenceTask({ kind: 'tts', mediaPath: '/tmp/video.mp4', sourceFingerprint: 'video:1', inputHash: 'tts:1', inputText: '需要朗读', ranges: [{ startSeconds: 0, endSeconds: 1 }] }, 100)
    const artifact = await createLocalTtsOperation({ executablePath: 'say', outputDirectory: '/tmp/aivplayer-tts-test', voice: 'Tingting', runCommand: recorder.run })({ task, range: task.ranges[0]!, rangeIndex: 0, totalRanges: 1, inputText: task.inputText }, new AbortController().signal)
    const audioPath = artifact.artifactType === 'tts-audio' ? artifact.audioPath : undefined

    expect(artifact).toMatchObject({ artifactType: 'tts-audio', text: '需要朗读', mimeType: 'audio/aiff', audioPath: `/tmp/aivplayer-tts-test/tts-${task.id}-0000.aiff` })
    expect(recorder.calls[0]).toMatchObject({ command: 'say', args: expect.arrayContaining(['-o', audioPath, '-v', 'Tingting', '需要朗读']) })

    const missingTextTask = createMediaEvidenceTask({ kind: 'tts', mediaPath: '/tmp/video.mp4', sourceFingerprint: 'video:1', inputHash: 'tts:2', ranges: [{ startSeconds: 0, endSeconds: 1 }] }, 100)
    await expect(createLocalTtsOperation({ executablePath: 'say', outputDirectory: '/tmp/aivplayer-tts-test', runCommand: recorder.run })({ task: missingTextTask, range: missingTextTask.ranges[0]!, rangeIndex: 0, totalRanges: 1 }, new AbortController().signal)).rejects.toThrow('TTS 任务缺少 inputText')
  })

  it('probes both configured commands and reports each capability independently', async () => {
    const recorder = createCommandRecorder({ tesseract: {}, say: {} })
    const capabilities = await probeLocalEvidenceCapabilities({ tesseractPath: 'tesseract', ttsPath: 'say', runCommand: recorder.run })

    expect(capabilities).toMatchObject({ ocr: { available: true, command: 'tesseract' }, tts: { available: true, command: 'say' } })
    expect(recorder.calls.map((call) => call.command).sort()).toEqual(['say', 'tesseract'])
  })
})
