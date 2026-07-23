import type { DramaProviderRequest } from '../../shared/drama-types'

export type DramaTextProvider = {
  generate: (request: DramaProviderRequest) => Promise<string>
}

export type DramaProviderErrorCode = 'configuration' | 'network-error' | 'http-error' | 'invalid-response'

export class DramaProviderError extends Error {
  readonly code: DramaProviderErrorCode
  readonly status?: number

  constructor(code: DramaProviderErrorCode, message: string, status?: number) {
    super(message)
    this.name = 'DramaProviderError'
    this.code = code
    this.status = status
  }
}

export type OpenAiCompatibleDramaProviderOptions = {
  baseUrl: string
  apiKey: string
  model: string
  fetchImpl?: typeof fetch
}

export type DramaProviderConfig = {
  baseUrl: string | null | undefined
  apiKey: string | null | undefined
  model: string | null | undefined
  useMock?: boolean
}

export function createOpenAiCompatibleDramaProvider(options: OpenAiCompatibleDramaProviderOptions): DramaTextProvider {
  const fetchImpl = options.fetchImpl ?? fetch
  return {
    async generate(request): Promise<string> {
      let response: Response
      try {
        response = await fetchImpl(options.baseUrl, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${options.apiKey}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            model: options.model,
            temperature: 0.4,
            messages: [
              { role: 'system', content: request.system },
              { role: 'user', content: request.user }
            ]
          }),
          signal: request.signal
        })
      } catch (error) {
        if (request.signal?.aborted || (error instanceof Error && error.name === 'AbortError')) throw error
        throw new DramaProviderError('network-error', '短剧 AI 服务网络请求失败')
      }
      if (!response.ok) throw new DramaProviderError('http-error', `短剧 AI 服务请求失败：HTTP ${response.status}`, response.status)
      let payload: unknown
      try {
        payload = await response.json()
      } catch {
        throw new DramaProviderError('invalid-response', '短剧 AI 服务返回的内容不是有效 JSON')
      }
      const content = getMessageContent(payload)
      if (!content) throw new DramaProviderError('invalid-response', '短剧 AI 服务没有返回文本内容')
      return content
    }
  }
}

export function createMockDramaProvider(responses: Partial<Record<DramaProviderRequest['stage'], string>> = {}): DramaTextProvider {
  return {
    async generate(request): Promise<string> {
      if (responses[request.stage]) return responses[request.stage] as string
      if (request.stage === 'assets') return JSON.stringify({ assets: [
        { assetType: 'character', name: '主角', description: '正在追查线索的年轻人。', visualPrompt: '年轻侦探，深色风衣，电影感写实风格' },
        { assetType: 'location', name: '旧车站', description: '夜晚的旧车站。', visualPrompt: '雨夜旧车站，冷色灯光，电影感' },
        { assetType: 'prop', name: '匿名信', description: '指向旧案的信件。', visualPrompt: '泛黄信封与手写字迹，近景' }
      ] })
      if (request.stage === 'storyboard') return JSON.stringify({ scenes: [
        { sceneIndex: 1, title: '车站收到匿名信', durationSeconds: 6, location: '旧车站', characters: ['主角'], action: '主角在雨中拆开匿名信，抬头望向远处。', dialogue: '主角：这不可能。', visualPrompt: '雨夜车站，主角拆开泛黄信封，冷色电影光影', cameraPrompt: '中近景推近到信件特写' }
      ] })
      return JSON.stringify({
        summary: '主角遭遇危机并获得新的行动目标。',
        characters: ['主角'],
        locations: ['未知地点'],
        conflict: '主角必须在有限时间内解决眼前危机。',
        hook: '新的线索指向更大的冲突。'
      })
    }
  }
}

export function createDramaProviderFromConfig(config: DramaProviderConfig): DramaTextProvider {
  if (config.useMock === true) return createMockDramaProvider()
  const baseUrl = config.baseUrl?.trim()
  const apiKey = config.apiKey?.trim()
  const model = config.model?.trim()
  if (!baseUrl || !apiKey || !model) {
    throw new DramaProviderError(
      'configuration',
      '未配置短剧 AI 服务。请填写接口地址、模型和 API Key，或启用本地 Mock 模式'
    )
  }
  return createOpenAiCompatibleDramaProvider({ baseUrl, apiKey, model })
}

export function createDramaProviderFromEnvironment(env: NodeJS.ProcessEnv = process.env): DramaTextProvider {
  const baseUrl = env.AIVPLAYER_DRAMA_API_BASE_URL?.trim()
  const apiKey = env.AIVPLAYER_DRAMA_API_KEY?.trim()
  const model = env.AIVPLAYER_DRAMA_MODEL?.trim()
  if (!baseUrl || !apiKey || !model) {
    throw new DramaProviderError(
      'configuration',
      '未配置短剧 AI 服务。请设置 AIVPLAYER_DRAMA_API_BASE_URL、AIVPLAYER_DRAMA_API_KEY 和 AIVPLAYER_DRAMA_MODEL'
    )
  }
  return createDramaProviderFromConfig({ baseUrl, apiKey, model })
}

function getMessageContent(value: unknown): string | null {
  if (!value || typeof value !== 'object') return null
  const choices = (value as { choices?: unknown }).choices
  if (!Array.isArray(choices)) return null
  const content = (choices[0] as { message?: { content?: unknown } } | undefined)?.message?.content
  return typeof content === 'string' && content.trim() ? content.trim() : null
}
