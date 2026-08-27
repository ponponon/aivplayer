# AI 服务多配置档案 + 独立设置分类 实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把「AI 服务」从字幕设置里独立成一级设置分类，并支持多个可切换的 OpenAI-compatible 配置档案（内置托管 + 自定义）。

**Architecture:** 新增 shared 模块 `ai-providers.ts` 承载档案类型与解析逻辑；`AppSettings.ai` 增加 `providers[]` + `activeProviderId`（schemaVersion 29→30，含旧字段迁移，apiKey 沿用 safeStorage 加密）；主进程 `getTranslationServiceConfig()` 改为解析激活档案单一入口；渲染进程新增 `settings-sections/ai-service.tsx` 面板并注册「AI 服务」tab。

**Tech Stack:** Electron + React + TypeScript（electron-vite），Vitest 单测，lucide-react 图标。

**Spec:** `docs/superpowers/specs/2026-08-27-ai-service-multi-provider-design.md`

## Global Constraints

- commit message 格式：`type(scope) : subject`（中文），尾部加 `edit by glm-5.3-flash`
- 工作区有**其他人未提交的 task-center 改动**（`src/core/tasks/task-center-store.ts`、`src/desktop/ipc-task-center.ts`、`src/preload/index.ts`、`src/renderer/src/app/app-shell.tsx`、`task-center.tsx`、`use-task-center.ts`、task-center 相关 css/i18n/ipc-channels/tests）。**每次 commit 必须只 add 本计划明确列出的文件**，绝不使用 `git add .` / `git add -A`。注意 `src/shared/i18n/locales/*.ts` 和 `src/preload/index.ts` 双方都会改，add 时用 `git add <path>` 并在 commit 前用 `git diff --cached --stat` 确认暂存区内容
- apiKey 一律经现有 `safeStorage` codec（`'safe:'` 前缀）加密落盘，禁止明文
- 内置托管档案 id 固定 `'managed'`，不可删除/编辑，其 baseUrl/model/apiKey 恒为 null
- 术语表 `asr.translationGlossary` 数据字段不动，UI 留在字幕 tab
- 验证命令：`npm run typecheck`、`npm test`（vitest 全量）、`npm run smoke:settings-dialog:all`
- 代码不加注释（遵循项目现状），UI 不用 emoji

---

### Task 1: shared 模块 `ai-providers.ts`（纯新增）

**Files:**
- Create: `src/shared/ai-providers.ts`
- Test: `tests/unit/ai-providers.test.ts`

**Interfaces:**
- Produces（后续所有任务依赖）:
  - `MANAGED_AI_PROVIDER_ID = 'managed'`
  - `MAX_AI_PROVIDER_PROFILES = 20`
  - `type AiProviderProfile = { id: string; name: string; kind: 'managed' | 'custom'; baseUrl: string | null; model: string | null; apiKey: string | null }`
  - `createManagedAiProvider(): AiProviderProfile`
  - `createCustomAiProvider(id: string): AiProviderProfile`
  - `resolveActiveAiProvider(providers: readonly AiProviderProfile[] | null | undefined, activeProviderId: string | null | undefined): AiProviderProfile`
  - `isAiProviderConfigured(provider: AiProviderProfile | null | undefined): boolean`

- [ ] **Step 1: 写失败测试**

```ts
// tests/unit/ai-providers.test.ts
import { describe, expect, it } from 'vitest'
import {
  MANAGED_AI_PROVIDER_ID,
  createCustomAiProvider,
  createManagedAiProvider,
  isAiProviderConfigured,
  resolveActiveAiProvider
} from '../../src/shared/ai-providers'

describe('ai providers', () => {
  it('falls back to the managed provider when the active id is missing', () => {
    const providers = [createManagedAiProvider(), createCustomAiProvider('custom-1')]
    expect(resolveActiveAiProvider(providers, 'missing-id').id).toBe(MANAGED_AI_PROVIDER_ID)
    expect(resolveActiveAiProvider(providers, null).id).toBe(MANAGED_AI_PROVIDER_ID)
    expect(resolveActiveAiProvider(null, 'custom-1').id).toBe(MANAGED_AI_PROVIDER_ID)
  })

  it('resolves the active custom provider', () => {
    const providers = [createManagedAiProvider(), { ...createCustomAiProvider('custom-1'), model: 'my-model' }]
    expect(resolveActiveAiProvider(providers, 'custom-1').model).toBe('my-model')
  })

  it('treats the managed provider as always configured and custom as configured only with all fields', () => {
    expect(isAiProviderConfigured(createManagedAiProvider())).toBe(true)
    expect(isAiProviderConfigured(null)).toBe(false)
    expect(isAiProviderConfigured(createCustomAiProvider('c'))).toBe(false)
    expect(
      isAiProviderConfigured({ ...createCustomAiProvider('c'), baseUrl: 'https://x/v1/chat/completions', model: 'm', apiKey: 'k' })
    ).toBe(true)
  })
})
```

- [ ] **Step 2: 运行确认失败** — `npx vitest run tests/unit/ai-providers.test.ts`，预期 FAIL（模块不存在）
- [ ] **Step 3: 实现**

```ts
// src/shared/ai-providers.ts
import type { TranslationServiceMode } from './translation-service'

export const MANAGED_AI_PROVIDER_ID = 'managed'
export const MAX_AI_PROVIDER_PROFILES = 20

export type AiProviderProfile = {
  id: string
  name: string
  kind: TranslationServiceMode
  baseUrl: string | null
  model: string | null
  apiKey: string | null
}

export function createManagedAiProvider(): AiProviderProfile {
  return { id: MANAGED_AI_PROVIDER_ID, name: '', kind: 'managed', baseUrl: null, model: null, apiKey: null }
}

export function createCustomAiProvider(id: string): AiProviderProfile {
  return { id, name: '', kind: 'custom', baseUrl: null, model: null, apiKey: null }
}

export function resolveActiveAiProvider(
  providers: readonly AiProviderProfile[] | null | undefined,
  activeProviderId: string | null | undefined
): AiProviderProfile {
  const list = Array.isArray(providers) ? providers : []
  return (
    list.find((provider) => provider.id === activeProviderId) ??
    list.find((provider) => provider.id === MANAGED_AI_PROVIDER_ID) ??
    createManagedAiProvider()
  )
}

export function isAiProviderConfigured(provider: AiProviderProfile | null | undefined): boolean {
  if (!provider) return false
  if (provider.kind === 'managed') return true
  return Boolean(provider.baseUrl?.trim() && provider.model?.trim() && provider.apiKey?.trim())
}
```

- [ ] **Step 4: 运行确认通过** — `npx vitest run tests/unit/ai-providers.test.ts`
- [ ] **Step 5: Commit**

```bash
git add src/shared/ai-providers.ts tests/unit/ai-providers.test.ts
git commit -m "feat(设置) : 新增 AI 服务配置档案共享模块

edit by glm-5.3-flash"
```

---

### Task 2: schema 30 + 迁移 + 主进程 + 渲染进程全量改造（一个大 commit）

> 这是核心迁移任务：shared 类型、主进程、渲染进程、i18n 必须一起改才能保持 typecheck 通过。改完后 UI 上「AI 服务」已是独立 tab。

**Files:**
- Modify: `src/shared/app-settings.ts`
- Modify: `src/shared/asr-types.ts`（`AsrTranslationServiceTestRequest` 增加 provider 覆盖参数）
- Modify: `src/core/app-settings.ts`（sanitize/迁移/加解码）
- Modify: `src/core/ai/asr-runtime.ts:74`（runtime options 注入点）
- Modify: `src/core/ai/whisper-cpp-runtime.ts:410-450`（`getTranslationServiceConfig`）、`:1172-1205`（probe override）
- Modify: `src/desktop/desktop-services.ts:60-66`（注入实现）
- Modify: `src/renderer/src/app/use-subtitle-derived.ts:19-21`
- Modify: `src/renderer/src/app/use-settings-actions.ts:83-112`
- Modify: `src/renderer/src/app/use-ai-setup.ts:45-48,59-63,91-95`
- Modify: `src/renderer/src/app/ai-setup-dialog.tsx:179-219`（TranslationStep）
- Modify: `src/renderer/src/app/settings-section-types.ts`（`onTestTranslationService` 签名）
- Modify: `src/renderer/src/app/settings-dialog-model.ts`（新 tab）
- Modify: `src/renderer/src/app/settings-section-panels.tsx`（注册 ai 面板）
- Modify: `src/renderer/src/app/settings-sections/subtitles.tsx`（移除翻译服务区块、术语表保留）
- Create: `src/renderer/src/app/settings-sections/ai-service.tsx`
- Delete: `src/renderer/src/app/translation-service-settings.tsx`
- Modify: `src/shared/i18n/locales/zh-CN.ts` `en-US.ts` `ja-JP.ts` `ko-KR.ts`（tabs.ai/tabAria.ai + settingsDialog.aiService.*）
- Test: `tests/unit/app-settings.test.ts`、`tests/unit/asr-runtime-settings.test.ts`

**Interfaces:**
- Consumes: Task 1 的全部导出
- Produces:
  - `AppSettings['ai'] = { openMode: AiAutomationMode; providers: AiProviderProfile[]; activeProviderId: string }`
  - `AppSettings['asr']` 不再含 `translationServiceMode/translationBaseUrl/translationModel/translationApiKey`，保留 `translationGlossary`
  - `AppSettingsSectionId` 含 `'ai'`
  - `AsrRuntimeOptions.getAiServiceSettings?: () => { providers: AiProviderProfile[]; activeProviderId: string; glossary: string | null } | null`
  - `AsrTranslationServiceTestRequest = { sourceLanguage?: string; targetLanguage: SubtitleTargetLanguageId; provider?: { kind: 'managed' | 'custom'; baseUrl: string | null; model: string | null; apiKey: string | null } }`
  - `SettingsSectionProps.onTestTranslationService: (provider?: AsrTranslationServiceTestRequest['provider']) => void`

- [ ] **Step 1: 更新 `src/shared/app-settings.ts`**

顶部 import 增加：

```ts
import { MANAGED_AI_PROVIDER_ID, createManagedAiProvider, type AiProviderProfile } from './ai-providers'
```

改动点：
1. `export const APP_SETTINGS_SCHEMA_VERSION = 30`
2. `export type AppSettingsSectionId = 'general' | 'ai' | 'interface' | 'video' | 'subtitles' | 'capture' | 'shortcuts'`
3. `AppSettings.ai` 改为：

```ts
  ai: {
    openMode: AiAutomationMode
    providers: AiProviderProfile[]
    activeProviderId: string
  }
```

4. `AppSettings.asr` 删除 `translationServiceMode / translationBaseUrl / translationModel / translationApiKey` 四行（保留 `translationGlossary: string | null`）
5. `createDefaultAppSettings()` 中：

```ts
    ai: {
      openMode: 'cache-only',
      providers: [createManagedAiProvider()],
      activeProviderId: MANAGED_AI_PROVIDER_ID
    },
```

asr 默认值删掉那四个字段。第 9 行 `import type { TranslationServiceMode } from './translation-service'` 若不再被本文件使用则删除。

- [ ] **Step 2: 更新 `src/shared/asr-types.ts`**

L79 的类型改为（保持文件内既有 import 风格；`kind` 直接内联联合类型避免新增 import）：

```ts
export type AsrTranslationServiceTestRequest = {
  sourceLanguage?: string
  targetLanguage: SubtitleTargetLanguageId
  provider?: { kind: 'managed' | 'custom'; baseUrl: string | null; model: string | null; apiKey: string | null }
}
```

确认 `src/shared/media-types.ts` 对 asr-types 是 `export *` 式再导出（preload 从 media-types 引 `AsrTranslationServiceTestRequest`），无需额外改动。

- [ ] **Step 3: 写数据层失败测试（更新 `tests/unit/app-settings.test.ts`）**

改动点（逐个替换，不要整文件重写）：
1. L46-48（`persists and reloads` 用例）替换为：

```ts
    settings.ai.providers = [
      createManagedAiProvider(),
      { ...createCustomAiProvider('custom-1'), name: '自定义', baseUrl: 'https://example.test/v1/chat/completions', model: 'translation-model', apiKey: 'secret-key' }
    ]
    settings.ai.activeProviderId = 'custom-1'
```

并在文件顶部 import 增加 `createCustomAiProvider, createManagedAiProvider, MANAGED_AI_PROVIDER_ID`（来自 `../../src/shared/ai-providers`）。该用例后面如有对 `asr.translation*` 的断言（L150-155、L165-177 一带的期望对象），同步改为新 `ai`/`asr` 形状：

```ts
      ai: {
        providers: [
          { id: MANAGED_AI_PROVIDER_ID, name: '', kind: 'managed', baseUrl: null, model: null, apiKey: null },
          { id: 'custom-1', name: '自定义', kind: 'custom', baseUrl: 'https://example.test/v1/chat/completions', model: 'translation-model', apiKey: 'secret-key' }
        ],
        activeProviderId: 'custom-1'
      },
      asr: {
        preferredModelSourceId: 'r2',
        defaultSubtitleLanguage: 'auto',
        autoLoadCachedSubtitles: true,
        translationGlossary: null
      }
```

2. L159-180 用例 `keeps legacy custom translation settings in custom mode` 整体替换为迁移用例：

```ts
  it('migrates legacy custom translation settings into a custom provider profile', async () => {
    await writeFile(
      join(tempDirectory, 'app-settings.json'),
      JSON.stringify({
        schemaVersion: 29,
        asr: {
          translationServiceMode: 'custom',
          translationBaseUrl: 'https://example.test/v1/chat/completions',
          translationModel: 'custom-model',
          translationApiKey: 'custom-key',
          translationGlossary: 'Technology=技术'
        }
      })
    )

    const settings = await readAppSettings(tempDirectory)

    expect(settings.schemaVersion).toBe(30)
    expect(settings.ai.providers).toHaveLength(2)
    expect(settings.ai.providers[0]).toEqual({ id: MANAGED_AI_PROVIDER_ID, name: '', kind: 'managed', baseUrl: null, model: null, apiKey: null })
    const migrated = settings.ai.providers[1]
    expect(migrated.kind).toBe('custom')
    expect(migrated.baseUrl).toBe('https://example.test/v1/chat/completions')
    expect(migrated.model).toBe('custom-model')
    expect(migrated.apiKey).toBe('custom-key')
    expect(settings.ai.activeProviderId).toBe(migrated.id)
    expect(settings.asr.translationGlossary).toBe('Technology=技术')
  })

  it('migrates legacy managed translation settings and falls back for invalid active ids', async () => {
    await writeFile(
      join(tempDirectory, 'app-settings.json'),
      JSON.stringify({
        schemaVersion: 29,
        asr: { translationServiceMode: 'managed' },
        ai: { activeProviderId: 'gone' }
      })
    )

    const settings = await readAppSettings(tempDirectory)

    expect(settings.ai.providers).toEqual([
      { id: MANAGED_AI_PROVIDER_ID, name: '', kind: 'managed', baseUrl: null, model: null, apiKey: null }
    ])
    expect(settings.ai.activeProviderId).toBe(MANAGED_AI_PROVIDER_ID)
  })

  it('forces managed provider secret fields back to null and keeps glossary untouched', async () => {
    await writeFile(
      join(tempDirectory, 'app-settings.json'),
      JSON.stringify({
        schemaVersion: 30,
        ai: {
          providers: [
            { id: MANAGED_AI_PROVIDER_ID, name: 'hack', kind: 'managed', baseUrl: 'https://evil.test', model: 'm', apiKey: 'k' },
            { id: MANAGED_AI_PROVIDER_ID, name: 'dup', kind: 'managed', baseUrl: null, model: null, apiKey: null }
          ],
          activeProviderId: MANAGED_AI_PROVIDER_ID
        },
        asr: { translationGlossary: 'AIVPlayer=AIV 播放器' }
      })
    )

    const settings = await readAppSettings(tempDirectory)

    expect(settings.ai.providers).toEqual([
      { id: MANAGED_AI_PROVIDER_ID, name: '', kind: 'managed', baseUrl: null, model: null, apiKey: null }
    ])
    expect(settings.asr.translationGlossary).toBe('AIVPlayer=AIV 播放器')
  })
```

3. L202-218 的 `schemaVersion: 29` 期望改为 `30`。
4. L225-237 术语表用例不动（字段还在 asr 下）。
5. L326-349+ 的加密用例：把 `settings.asr.translation*` 三行替换为一条带 `apiKey: 'secret-key'` 的自定义档案（同第 1 点），断言 `rawContent).not.toContain('secret-key')` 与解密后 reload 相等的逻辑保留。

- [ ] **Step 4: 实现 `src/core/app-settings.ts`**

1. import 增加：`import { randomUUID } from 'node:crypto'`；从 `../shared/ai-providers` 引入 `MANAGED_AI_PROVIDER_ID, MAX_AI_PROVIDER_PROFILES, createManagedAiProvider, type AiProviderProfile`
2. `isSettingsSectionId` 增加 `value === 'ai'`
3. 删除 `sanitizeAsrSettings` 中 `translationServiceMode/translationBaseUrl/translationModel/translationApiKey` 的推断与输出（保留 `preferredModelSourceId/defaultSubtitleLanguage/autoLoadCachedSubtitles/translationGlossary`）
4. 新增：

```ts
function sanitizeAiProviderProfile(value: unknown): AiProviderProfile | null {
  if (!value || typeof value !== 'object') return null
  const provider = value as Partial<AiProviderProfile>
  const kind: AiProviderProfile['kind'] = provider.kind === 'custom' ? 'custom' : 'managed'
  const id = typeof provider.id === 'string' ? provider.id.trim().slice(0, 128) : ''
  if (!id) return null
  const managed = kind === 'managed'
  return {
    id,
    name: typeof provider.name === 'string' ? provider.name.trim().slice(0, 64) : '',
    kind,
    baseUrl: managed ? null : normalizeTextField(provider.baseUrl, null),
    model: managed ? null : normalizeTextField(provider.model, null),
    apiKey: managed ? null : normalizeTextField(provider.apiKey, null)
  }
}

function sanitizeAiSettings(
  value: Partial<AppSettings['ai']> | undefined,
  legacyAsr: Record<string, unknown> | undefined,
  defaults: AppSettings['ai']
): AppSettings['ai'] {
  const ai = value ?? {}
  const providers: AiProviderProfile[] = []
  if (Array.isArray(ai.providers)) {
    for (const raw of ai.providers) {
      const provider = sanitizeAiProviderProfile(raw)
      if (!provider || providers.some((existing) => existing.id === provider.id)) continue
      providers.push(provider)
      if (providers.length >= MAX_AI_PROVIDER_PROFILES) break
    }
  }

  const legacyMode = legacyAsr?.translationServiceMode
  const hasLegacyCustomFields = [legacyAsr?.translationBaseUrl, legacyAsr?.translationModel, legacyAsr?.translationApiKey].some(
    (field) => typeof field === 'string' && (field as string).trim().length > 0
  )
  let migratedActiveProviderId: string | null = null
  if (providers.length === 0 && (legacyMode === 'managed' || legacyMode === 'custom' || hasLegacyCustomFields)) {
    providers.push(createManagedAiProvider())
    if (legacyMode === 'custom' || hasLegacyCustomFields) {
      const migrated = sanitizeAiProviderProfile({
        id: randomUUID(),
        kind: 'custom',
        baseUrl: legacyAsr?.translationBaseUrl,
        model: legacyAsr?.translationModel,
        apiKey: legacyAsr?.translationApiKey
      })
      if (migrated) {
        providers.push(migrated)
        migratedActiveProviderId = migrated.id
      }
    }
  }

  if (!providers.some((provider) => provider.id === MANAGED_AI_PROVIDER_ID)) {
    providers.unshift(createManagedAiProvider())
  }

  return {
    openMode: isAiAutomationMode(ai.openMode) ? ai.openMode : defaults.openMode,
    providers,
    activeProviderId:
      typeof ai.activeProviderId === 'string' && providers.some((provider) => provider.id === ai.activeProviderId)
        ? ai.activeProviderId
        : migratedActiveProviderId ?? MANAGED_AI_PROVIDER_ID
  }
}
```

5. `sanitizeAppSettings` 里把 `ai: sanitizeAiSettings(value.ai, defaults.ai)` 改为 `ai: sanitizeAiSettings(value.ai, value.asr as Record<string, unknown> | undefined, defaults.ai)`；`value` 的交叉类型声明处 `asr?:` 保持 `Partial<AppSettings['asr']>` 即可（旧字段经 `Record<string, unknown>` 读取）
6. `encodeAppSettingsForDisk`：删除 `asr` 块的 `translationApiKey` 编码，改为：

```ts
    ai: {
      ...settings.ai,
      providers: settings.ai.providers.map((provider) =>
        provider.apiKey ? { ...provider, apiKey: encodeSecretValue(provider.apiKey, secretCodec) } : provider
      )
    }
```

7. `readAppSettings`：在现有 `parsed.asr.translationApiKey` 解码块之后（asr 解码块可整体删除，因为类型上已无该字段；保留 drama 解码块），新增：

```ts
    if (parsed.ai?.providers && Array.isArray(parsed.ai.providers)) {
      const needsCodec = parsed.ai.providers.some(
        (provider) => typeof provider?.apiKey === 'string' && provider.apiKey.startsWith(APP_SETTINGS_SECRET_PREFIX)
      )
      if (needsCodec) {
        const codec = secretCodec ?? (await resolveAppSettingsSecretCodec())
        parsed.ai = {
          ...parsed.ai,
          providers: parsed.ai.providers.map((provider) =>
            typeof provider?.apiKey === 'string' && provider.apiKey.startsWith(APP_SETTINGS_SECRET_PREFIX)
              ? { ...provider, apiKey: decodeSecretValue(provider.apiKey, codec) }
              : provider
          )
        }
      }
    }
```

同时删除 parsed 类型声明里 `asr` 的 `translationApiKey?: unknown` 交叉字段。

8. `writeAppSettings` 的 codec 解析条件改为：

```ts
  const hasProviderSecret = nextSettings.ai.providers.some(
    (provider) => typeof provider.apiKey === 'string' && provider.apiKey.length > 0
  )
  const codec = hasProviderSecret ? secretCodec ?? (await resolveAppSettingsSecretCodec()) : secretCodec
```

- [ ] **Step 5: 运行数据层测试** — `npx vitest run tests/unit/app-settings.test.ts`，预期全部 PASS（此时 typecheck 会因主进程/渲染进程消费方报错，下一步修复）

- [ ] **Step 6: 主进程 runtime 与注入点**

1. `src/core/ai/asr-runtime.ts` L74 替换为：

```ts
  getAiServiceSettings?: () => { providers: AiProviderProfile[]; activeProviderId: string; glossary: string | null } | null
```

并 import `type { AiProviderProfile } from '../../shared/ai-providers'`（注意相对路径：asr-runtime.ts 位于 src/core/ai/，用 `'../../shared/ai-providers'`）。

2. `src/core/ai/whisper-cpp-runtime.ts` L410-450 的 `getTranslationServiceConfig` 整体替换为：

```ts
  const getTranslationServiceConfig = (): {
    mode: TranslationServiceMode
    baseUrl: string | null
    apiKey: string | null
    model: string | null
    glossary: string | null
  } => {
    const aiSettings = options.getAiServiceSettings?.()
    const activeProvider = resolveActiveAiProvider(aiSettings?.providers, aiSettings?.activeProviderId)
    const glossary = aiSettings?.glossary?.trim() || env.AIVPLAYER_TRANSLATION_GLOSSARY?.trim() || null

    if (activeProvider.kind === 'managed') {
      return {
        mode: 'managed',
        baseUrl: MANAGED_TRANSLATION_SERVICE_ENDPOINT,
        apiKey: MANAGED_TRANSLATION_SERVICE_AUTH_TOKEN,
        model: MANAGED_TRANSLATION_SERVICE_MODEL,
        glossary
      }
    }

    return {
      mode: 'custom',
      baseUrl: activeProvider.baseUrl?.trim() || env.AIVPLAYER_TRANSLATION_BASE_URL?.trim() || null,
      apiKey: activeProvider.apiKey?.trim() || env.AIVPLAYER_TRANSLATION_API_KEY?.trim() || null,
      model: activeProvider.model?.trim() || env.AIVPLAYER_TRANSLATION_MODEL?.trim() || null,
      glossary
    }
  }
```

import 增加 `resolveActiveAiProvider`（`../../shared/ai-providers`，注意该文件当前对 shared 的引用路径写法保持一致）。

3. 同文件 `testTranslationService`（L1172-1188）的 provider 构造改为支持未保存档案测试：

```ts
      const providerOverride = request.provider
      const translationServiceConfig = providerOverride
        ? {
            mode: providerOverride.kind,
            baseUrl: providerOverride.kind === 'managed'
              ? MANAGED_TRANSLATION_SERVICE_ENDPOINT
              : providerOverride.baseUrl?.trim() || null,
            apiKey: providerOverride.kind === 'managed'
              ? MANAGED_TRANSLATION_SERVICE_AUTH_TOKEN
              : providerOverride.apiKey?.trim() || null,
            model: providerOverride.kind === 'managed'
              ? MANAGED_TRANSLATION_SERVICE_MODEL
              : providerOverride.model?.trim() || null,
            glossary: options.getAiServiceSettings?.()?.glossary?.trim() || env.AIVPLAYER_TRANSLATION_GLOSSARY?.trim() || null
          }
        : getTranslationServiceConfig()
```

其余 probe 逻辑不动。

4. `src/desktop/desktop-services.ts` L60-66 替换为：

```ts
      getAiServiceSettings: () => ({
        providers: desktopState.currentAppSettings.ai.providers,
        activeProviderId: desktopState.currentAppSettings.ai.activeProviderId,
        glossary: desktopState.currentAppSettings.asr.translationGlossary
      })
```

- [ ] **Step 7: 更新 `tests/unit/asr-runtime-settings.test.ts`**

- L329：`getTranslationServiceSettings: () => ({ translationServiceMode: 'managed' })` →
  `getAiServiceSettings: () => ({ providers: [createManagedAiProvider()], activeProviderId: MANAGED_AI_PROVIDER_ID, glossary: null })`
- L533-537：→
  `getAiServiceSettings: () => ({ providers: [{ id: 'custom-1', name: 'Custom', kind: 'custom', baseUrl: 'https://example.test/v1/chat/completions', model: 'saved-model', apiKey: 'saved-key' }], activeProviderId: 'custom-1', glossary: null })`
- 文件顶部 import 增加 `createManagedAiProvider, MANAGED_AI_PROVIDER_ID`（`../../src/shared/ai-providers`）
- 末尾追加用例：

```ts
  it('probes the translation service with an unsaved provider override', async () => {
    const requests: Array<{ url: string; authorization: string | null; model: string | undefined }> = []
    const runtime = createWhisperCppRuntime({
      userDataPath: tempDirectory,
      resourcePath: join(tempDirectory, 'resources'),
      env: {
        AIVPLAYER_TRANSLATION_BASE_URL: 'https://env.invalid/v1/chat/completions',
        AIVPLAYER_TRANSLATION_API_KEY: 'env-key',
        AIVPLAYER_TRANSLATION_MODEL: 'env-model'
      },
      translationFetch: async (url, init) => {
        const body = JSON.parse(String(init?.body ?? '{}')) as { model?: string }
        requests.push({
          url,
          authorization: init?.headers instanceof Headers ? init.headers.get('Authorization') : null,
          model: body.model
        })
        return new Response(
          JSON.stringify({ choices: [{ message: { content: JSON.stringify([{ id: 'cue-1', text: '你好' }]) } }] }),
          { status: 200, headers: { 'content-type': 'application/json' } }
        )
      }
    })

    const result = await runtime.testTranslationService({
      sourceLanguage: 'en',
      targetLanguage: 'zh',
      provider: { kind: 'custom', baseUrl: 'https://override.test/v1/chat/completions', model: 'override-model', apiKey: 'override-key' }
    })

    expect(result.success).toBe(true)
    expect(requests).toEqual([
      { url: 'https://override.test/v1/chat/completions', authorization: 'Bearer override-key', model: 'override-model' }
    ])
  })
```

- [ ] **Step 8: 渲染进程机械改造**

1. `use-subtitle-derived.ts` L19-21 替换为：

```ts
  const activeAiProvider = resolveActiveAiProvider(model.appSettings.ai.providers, model.appSettings.ai.activeProviderId)
  const subtitleTranslationModel = activeAiProvider.kind === 'managed'
    ? MANAGED_TRANSLATION_SERVICE_MODEL
    : activeAiProvider.model?.trim() ?? ''
```

import 增加 `resolveActiveAiProvider`（`../../../shared/ai-providers`）。

2. `use-settings-actions.ts`：
   - `testTranslationService` 签名改为 `async (provider?: AsrTranslationServiceTestRequest['provider']): Promise<void>`，`window.aiv.testAsrTranslationService({ sourceLanguage, targetLanguage, provider })`；import `type { AsrTranslationServiceTestRequest } from '../../../shared/asr-types'`（若 media-types 已再导出则从 media-types 引，保持项目习惯）
   - fallback 里 `translationBaseUrlSummary` 改为基于激活档案：

```ts
  const activeAiProvider = resolveActiveAiProvider(appSettings.ai.providers, appSettings.ai.activeProviderId)
```

```ts
        translationBaseUrlSummary: activeAiProvider.kind === 'managed'
          ? MANAGED_TRANSLATION_SERVICE_ENDPOINT
          : activeAiProvider.baseUrl?.trim() || undefined
```

   - L110-112 `useEffect` 依赖改为 `[activeAiProvider.id, derived.subtitleTranslationGlossary, derived.subtitleTranslationSourceLanguage, appSettings.subtitles.targetLanguage]`（`activeAiProvider` 计算移到组件体内、effect 之前）

3. `use-ai-setup.ts`：三处 `translationConfigured` 判定统一替换为：

```ts
    const translationConfigured = isAiProviderConfigured(
      resolveActiveAiProvider(currentModel.appSettings.ai.providers, currentModel.appSettings.ai.activeProviderId)
    )
```

顶层 `isTranslationConfigured`（L45-49）：

```ts
  const isTranslationConfigured = isAiProviderConfigured(
    resolveActiveAiProvider(model.appSettings.ai.providers, model.appSettings.ai.activeProviderId)
  )
```

import 增加 `isAiProviderConfigured, resolveActiveAiProvider`。

- [ ] **Step 9: 新组件 `src/renderer/src/app/settings-sections/ai-service.tsx`**

```tsx
import { Pencil, Plus, Sparkles, Trash2 } from 'lucide-react'
import { useState } from 'react'
import type { ReactElement } from 'react'
import {
  MANAGED_AI_PROVIDER_ID,
  MAX_AI_PROVIDER_PROFILES,
  createCustomAiProvider,
  resolveActiveAiProvider,
  type AiProviderProfile
} from '../../../shared/ai-providers'
import { SettingsField, SettingsSelect } from '../settings-controls'
import { SettingsTextInput } from '../settings-inputs'
import type { SettingsSectionProps } from '../settings-section-types'

type AiProviderDraft = { name: string; baseUrl: string; model: string; apiKey: string }

function getProviderDisplayName(copy: SettingsSectionProps['copy'], provider: AiProviderProfile): string {
  if (provider.name) return provider.name
  return provider.kind === 'managed'
    ? copy.settingsDialog.aiService.managedProviderName
    : copy.settingsDialog.aiService.customProviderName
}

export function AiServiceSettingsSection({
  copy,
  settings,
  patchSettingsSection,
  translationServiceTestMessage,
  isTestingTranslationService,
  translationServiceSourceLanguageLabel,
  translationServiceTargetLanguageLabel,
  translationServiceEndpointSummary,
  onTestTranslationService
}: SettingsSectionProps): ReactElement {
  const [editingProviderId, setEditingProviderId] = useState<string | null>(null)
  const [draft, setDraft] = useState<AiProviderDraft | null>(null)

  const activeProvider = resolveActiveAiProvider(settings.ai.providers, settings.ai.activeProviderId)
  const providerOptions = settings.ai.providers.map((provider) => ({
    value: provider.id,
    label: getProviderDisplayName(copy, provider)
  }))
  const isEditing = editingProviderId !== null && draft !== null

  const startEditing = (provider: AiProviderProfile): void => {
    setEditingProviderId(provider.id)
    setDraft({ name: provider.name, baseUrl: provider.baseUrl ?? '', model: provider.model ?? '', apiKey: provider.apiKey ?? '' })
  }
  const resetEditing = (): void => {
    setEditingProviderId(null)
    setDraft(null)
  }
  const startCreating = (): void => {
    const provider = createCustomAiProvider(`custom-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`)
    patchSettingsSection('ai', (current) => ({
      ...current,
      providers: [...current.providers, provider],
      activeProviderId: provider.id
    }))
    startEditing(provider)
  }
  const saveEditing = (): void => {
    if (!editingProviderId || !draft) return
    patchSettingsSection('ai', (current) => ({
      ...current,
      providers: current.providers.map((provider) =>
        provider.id === editingProviderId
          ? {
              ...provider,
              name: draft.name.trim(),
              kind: 'custom' as const,
              baseUrl: draft.baseUrl.trim() || null,
              model: draft.model.trim() || null,
              apiKey: draft.apiKey.trim() || null
            }
          : provider
      )
    }))
    resetEditing()
  }
  const deleteProvider = (providerId: string): void => {
    if (providerId === MANAGED_AI_PROVIDER_ID) return
    patchSettingsSection('ai', (current) => ({
      ...current,
      providers: current.providers.filter((provider) => provider.id !== providerId),
      activeProviderId: current.activeProviderId === providerId ? MANAGED_AI_PROVIDER_ID : current.activeProviderId
    }))
    if (editingProviderId === providerId) resetEditing()
  }
  const testDraftProvider = (): void => {
    onTestTranslationService(
      draft
        ? { kind: 'custom' as const, baseUrl: draft.baseUrl.trim() || null, model: draft.model.trim() || null, apiKey: draft.apiKey.trim() || null }
        : undefined
    )
  }

  return (
    <>
      <div className="settings-note-box">
        <span className="settings-note-title">{copy.settingsDialog.aiService.title}</span>
        <p>{copy.settingsDialog.aiService.introDescription}</p>
      </div>
      <SettingsField title={copy.settingsDialog.aiService.activeProvider} description={copy.settingsDialog.subtitles.translationServiceModeDescription}>
        <SettingsSelect
          value={settings.ai.activeProviderId}
          options={providerOptions}
          onChange={(activeProviderId) => patchSettingsSection('ai', { activeProviderId })}
        />
      </SettingsField>
      {activeProvider.kind === 'managed' ? (
        <div className="settings-note-box">
          <span className="settings-note-title">{copy.settingsDialog.subtitles.translationServiceManagedTitle}</span>
          <p>{copy.settingsDialog.subtitles.translationServiceManagedDescription}</p>
        </div>
      ) : null}
      <div className="settings-field settings-card-wide settings-cache-management">
        <div className="settings-field-copy">
          <strong>{copy.settingsDialog.aiService.profileListTitle}</strong>
          <small>{copy.settingsDialog.subtitles.translationServiceDescription}</small>
        </div>
        <div className="settings-inline-row settings-cache-actions">
          <button
            className="settings-secondary-button"
            type="button"
            onClick={startCreating}
            disabled={isEditing || settings.ai.providers.length >= MAX_AI_PROVIDER_PROFILES}
          >
            <Plus size={14} />
            {copy.settingsDialog.aiService.addProfile}
          </button>
        </div>
        {settings.ai.providers.map((provider) => (
          <div className="settings-field-copy" key={provider.id}>
            <strong>{getProviderDisplayName(copy, provider)}</strong>
            <small>
              {provider.kind === 'managed'
                ? copy.settingsDialog.aiService.managedBadge
                : copy.settingsDialog.aiService.customBadge}
              {settings.ai.activeProviderId === provider.id ? ` · ${copy.settingsDialog.aiService.activeBadge}` : ''}
              {provider.model ? ` · ${provider.model}` : ''}
            </small>
            {provider.kind === 'custom' ? (
              <div className="settings-inline-row settings-cache-actions">
                <button className="settings-secondary-button" type="button" onClick={() => startEditing(provider)} disabled={isEditing}>
                  <Pencil size={14} />
                  {copy.settingsDialog.aiService.editProfile}
                </button>
                <button className="settings-secondary-button" type="button" onClick={() => deleteProvider(provider.id)} disabled={isEditing}>
                  <Trash2 size={14} />
                  {copy.settingsDialog.aiService.deleteProfile}
                </button>
              </div>
            ) : null}
          </div>
        ))}
      </div>
      {isEditing && draft ? (
        <>
          <SettingsField title={copy.settingsDialog.aiService.nameField} description={copy.settingsDialog.aiService.nameFieldDescription}>
            <SettingsTextInput value={draft.name} autoComplete="off" onChange={(name) => setDraft({ ...draft, name })} />
          </SettingsField>
          <SettingsField title={copy.settingsDialog.subtitles.translationBaseUrl} description={copy.settingsDialog.subtitles.translationBaseUrlDescription}>
            <SettingsTextInput value={draft.baseUrl} autoComplete="off" onChange={(baseUrl) => setDraft({ ...draft, baseUrl })} />
          </SettingsField>
          <SettingsField title={copy.settingsDialog.subtitles.translationModel} description={copy.settingsDialog.subtitles.translationModelDescription}>
            <SettingsTextInput value={draft.model} autoComplete="off" onChange={(model) => setDraft({ ...draft, model })} />
          </SettingsField>
          <SettingsField title={copy.settingsDialog.subtitles.translationApiKey} description={copy.settingsDialog.subtitles.translationApiKeyDescription}>
            <SettingsTextInput type="password" value={draft.apiKey} autoComplete="new-password" onChange={(apiKey) => setDraft({ ...draft, apiKey })} />
          </SettingsField>
          <SettingsField title={copy.settingsDialog.subtitles.translationServiceCheckTitle} description={copy.settingsDialog.subtitles.translationServiceCheckDescription}>
            <div className="settings-inline-row">
              <button className="settings-secondary-button" type="button" onClick={testDraftProvider} disabled={isTestingTranslationService}>
                <Sparkles size={14} />
                {isTestingTranslationService ? copy.settingsDialog.subtitles.translationServiceChecking : copy.settingsDialog.subtitles.translationServiceCheck}
              </button>
              <button className="settings-secondary-button" type="button" onClick={saveEditing}>{copy.settingsDialog.aiService.saveProfile}</button>
              <button className="settings-secondary-button" type="button" onClick={resetEditing}>{copy.settingsDialog.aiService.cancelEdit}</button>
            </div>
          </SettingsField>
        </>
      ) : null}
      {translationServiceTestMessage ? (
        <div className={`asr-result ${translationServiceTestMessage.success ? 'success' : 'failed'}`}>{translationServiceTestMessage.message}</div>
      ) : null}
      {translationServiceTestMessage ? (
        <div className="settings-note-box">
          <span className="settings-note-title">{copy.settingsDialog.subtitles.translationServiceResultTitle}</span>
          <div className="settings-meta-grid">
            <div className="settings-meta-item"><span>{copy.asrPanel.translationLanguagePair}</span><strong>{translationServiceSourceLanguageLabel} → {translationServiceTargetLanguageLabel}</strong></div>
            <div className="settings-meta-item"><span>{copy.asrPanel.translationModel}</span><strong>{translationServiceTestMessage.translationModel ?? '—'}</strong></div>
            <div className="settings-meta-item"><span>{copy.settingsDialog.subtitles.translationBaseUrl}</span><strong>{translationServiceEndpointSummary}</strong></div>
          </div>
          {translationServiceTestMessage.success && translationServiceTestMessage.sampleSourceText && translationServiceTestMessage.sampleTranslatedText ? (
            <>
              <span className="settings-note-title">{copy.settingsDialog.subtitles.translationServicePreviewTitle}</span>
              <p>{translationServiceTestMessage.sampleSourceText} → {translationServiceTestMessage.sampleTranslatedText}</p>
            </>
          ) : null}
        </div>
      ) : null}
    </>
  )
}
```

- [ ] **Step 10: i18n（4 个 locale 同步）**

在每个 locale 的 `settingsDialog.tabs` / `tabAria` 中插入 `ai`（紧跟 general 之后）：
- zh-CN：`ai: 'AI 服务'` / `ai: '跳到 AI 服务设置'`
- en-US：`ai: 'AI service'` / `ai: 'Jump to AI service settings'`
- ja-JP：`ai: 'AI サービス'` / `ai: 'AI サービス設定へ移動'`
- ko-KR：`ai: 'AI 서비스'` / `ai: 'AI 서비스 설정으로 이동'`

在每个 locale 的 `settingsDialog` 下（与 `subtitles` 平级）新增 `aiService` 段：

zh-CN：
```ts
        aiService: {
          title: 'AI 服务',
          introDescription: '翻译和总结等 AI 功能统一使用「当前使用」的配置档案。内置托管服务开箱即用，也可以添加自己的 OpenAI-compatible 服务。',
          activeProvider: '当前使用的服务',
          profileListTitle: '配置档案',
          addProfile: '新增配置',
          activeBadge: '使用中',
          managedBadge: '内置托管',
          customBadge: '自定义',
          managedProviderName: '内置托管服务',
          customProviderName: '自定义服务',
          editProfile: '编辑',
          deleteProfile: '删除',
          saveProfile: '保存',
          cancelEdit: '取消',
          nameField: '档案名称',
          nameFieldDescription: '用于在档案列表中区分不同的服务，留空时按类型显示默认名。'
        },
```

en-US：
```ts
        aiService: {
          title: 'AI service',
          introDescription: 'Translation and summary features share the active profile. The managed service works out of the box, and you can add your own OpenAI-compatible services.',
          activeProvider: 'Active service',
          profileListTitle: 'Profiles',
          addProfile: 'Add profile',
          activeBadge: 'in use',
          managedBadge: 'Managed',
          customBadge: 'Custom',
          managedProviderName: 'Managed service',
          customProviderName: 'Custom service',
          editProfile: 'Edit',
          deleteProfile: 'Delete',
          saveProfile: 'Save',
          cancelEdit: 'Cancel',
          nameField: 'Profile name',
          nameFieldDescription: 'Distinguishes profiles in the list. Falls back to the type default when empty.'
        },
```

ja-JP：
```ts
        aiService: {
          title: 'AI サービス',
          introDescription: '翻訳と要約の AI 機能は「使用中」のプロファイルを共通で使います。管理サービスはすぐに使え、OpenAI-compatible なサービスを追加することもできます。',
          activeProvider: '使用中のサービス',
          profileListTitle: 'プロファイル',
          addProfile: 'プロファイル追加',
          activeBadge: '使用中',
          managedBadge: '管理サービス',
          customBadge: 'カスタム',
          managedProviderName: '管理サービス',
          customProviderName: 'カスタムサービス',
          editProfile: '編集',
          deleteProfile: '削除',
          saveProfile: '保存',
          cancelEdit: 'キャンセル',
          nameField: 'プロファイル名',
          nameFieldDescription: 'リスト内で区別するための名前。空の場合は種別の既定名を表示します。'
        },
```

ko-KR：
```ts
        aiService: {
          title: 'AI 서비스',
          introDescription: '번역·요약 등 AI 기능은 "사용 중" 프로필을 공통으로 사용합니다. 관리형 서비스는 바로 쓸 수 있고, OpenAI-compatible 서비스를 추가할 수도 있습니다.',
          activeProvider: '사용 중인 서비스',
          profileListTitle: '프로필',
          addProfile: '프로필 추가',
          activeBadge: '사용 중',
          managedBadge: '관리형',
          customBadge: '사용자 지정',
          managedProviderName: '관리형 서비스',
          customProviderName: '사용자 지정 서비스',
          editProfile: '편집',
          deleteProfile: '삭제',
          saveProfile: '저장',
          cancelEdit: '취소',
          nameField: '프로필 이름',
          nameFieldDescription: '목록에서 구별하기 위한 이름입니다. 비워 두면 유형 기본 이름이 표시됩니다.'
        },
```

注意：i18n 的 LocaleCopy 类型由 locale 对象推导，四个文件必须同时加，否则 typecheck 报错。

- [ ] **Step 11: 设置面板接线**

1. `settings-section-types.ts`：`onTestTranslationService: () => void` 改为 `onTestTranslationService: (provider?: AsrTranslationServiceTestRequest['provider']) => void`，import type 从 `../../../shared/media-types`（确认 `AsrTranslationServiceTestRequest` 从那里再导出；若没有则从 `../../../shared/asr-types` 引）
2. `settings-dialog-model.ts`：lucide import 增加 `Sparkles`；`getSettingsTabs` 在 general 之后插入：

```ts
    { id: 'ai', label: copy.settingsDialog.tabs.ai, ariaLabel: copy.settingsDialog.tabAria.ai, icon: Sparkles },
```

3. `settings-section-panels.tsx`：import `AiServiceSettingsSection` from `'./settings-sections/ai-service'`；`sectionComponents` 增加 `ai: AiServiceSettingsSection`
4. `settings-sections/subtitles.tsx`：删除 `import { TranslationServiceSettings } ...` 与末尾 `<TranslationServiceSettings {...props} />`；在其原位置加入术语表字段（import `SettingsTextarea` from `'../settings-inputs'`）：

```tsx
      <SettingsField title={copy.settingsDialog.subtitles.translationGlossary} description={copy.settingsDialog.subtitles.translationGlossaryDescription}>
        <SettingsTextarea
          value={settings.asr.translationGlossary ?? ''}
          ariaLabel={copy.settingsDialog.subtitles.translationGlossary}
          onChange={(translationGlossary) => patchSettingsSection('asr', { translationGlossary: translationGlossary.trim() || null })}
        />
      </SettingsField>
```

5. 删除 `src/renderer/src/app/translation-service-settings.tsx`
6. `ai-setup-dialog.tsx` 的 `TranslationStep`（L179-219）重写为基于激活档案：

```tsx
function TranslationStep(): React.ReactElement {
  const app = useAppContext()
  const settings = app.appSettings
  const activeAiProvider = resolveActiveAiProvider(settings.ai.providers, settings.ai.activeProviderId)
  const updateActiveProvider = (patch: Partial<AiProviderProfile>): void => {
    app.patchAppSettingsSection('ai', (current) => ({
      ...current,
      providers: current.providers.map((provider) =>
        provider.id === current.activeProviderId ? { ...provider, ...patch } : provider
      )
    }))
  }
  return <div className="ai-setup-translation-form">
    <p className="ai-setup-detail-copy">{app.copy.aiSetup.translationFormDescription}</p>
    <SettingsField title={app.copy.settingsDialog.aiService.activeProvider} description={app.copy.settingsDialog.subtitles.translationServiceModeDescription}>
      <SettingsSelect
        value={settings.ai.activeProviderId}
        options={settings.ai.providers.map((provider) => ({
          value: provider.id,
          label: provider.name || (provider.kind === 'managed'
            ? app.copy.settingsDialog.aiService.managedProviderName
            : app.copy.settingsDialog.aiService.customProviderName)
        }))}
        onChange={(activeProviderId) => app.patchAppSettingsSection('ai', { activeProviderId })}
      />
    </SettingsField>
    {activeAiProvider.kind === 'managed' ? (
      <div className="settings-note-box">
        <span className="settings-note-title">{app.copy.settingsDialog.subtitles.translationServiceManagedTitle}</span>
        <p>{app.copy.settingsDialog.subtitles.translationServiceManagedDescription}</p>
      </div>
    ) : (
      <>
        <SettingsField title={app.copy.settingsDialog.subtitles.translationBaseUrl} description={app.copy.settingsDialog.subtitles.translationBaseUrlDescription}>
          <SettingsTextInput value={activeAiProvider.baseUrl ?? ''} autoComplete="off" onChange={(value) => updateActiveProvider({ baseUrl: value.trim() || null })} />
        </SettingsField>
        <SettingsField title={app.copy.settingsDialog.subtitles.translationModel} description={app.copy.settingsDialog.subtitles.translationModelDescription}>
          <SettingsTextInput value={activeAiProvider.model ?? ''} autoComplete="off" onChange={(value) => updateActiveProvider({ model: value.trim() || null })} />
        </SettingsField>
        <SettingsField title={app.copy.settingsDialog.subtitles.translationApiKey} description={app.copy.settingsDialog.subtitles.translationApiKeyDescription}>
          <SettingsTextInput type="password" value={activeAiProvider.apiKey ?? ''} autoComplete="new-password" onChange={(value) => updateActiveProvider({ apiKey: value.trim() || null })} />
        </SettingsField>
      </>
    )}
    <div className="ai-setup-translation-actions">
      <button className="ai-setup-translation-test-button" type="button" onClick={app.testTranslationService} disabled={!app.isTranslationConfigured || app.isTestingTranslationService}><Sparkles size={14} />{app.isTestingTranslationService ? app.copy.settingsDialog.subtitles.translationServiceChecking : app.copy.settingsDialog.subtitles.translationServiceCheck}</button>
      <span className={`ai-setup-test-state ${app.translationServiceTestMessage?.success ? 'is-ready' : ''}`}>{app.translationServiceTestMessage?.success ? app.copy.aiSetup.testPassed : app.isTranslationConfigured ? app.copy.aiSetup.configured : app.copy.aiSetup.fillRequired}</span>
    </div>
    {app.translationServiceTestMessage ? <div className={`asr-result ${app.translationServiceTestMessage.success ? 'success' : 'failed'}`}>{app.translationServiceTestMessage.message}</div> : null}
  </div>
}
```

import 增加 `resolveActiveAiProvider, type AiProviderProfile`（`../../../shared/ai-providers`）。

- [ ] **Step 12: 全量验证**

```bash
npm run typecheck
npm test
```

预期：typecheck 0 错误；全量 vitest PASS（`settings-ui-source.test.ts` 可能失败——它断言了旧文件与旧 patch 调用，**本任务允许它失败**，Task 3 修复；若其他测试失败必须在本任务内修完）。

- [ ] **Step 13: Commit**

```bash
git diff --cached --stat   # 先确认暂存区
git add src/shared/app-settings.ts src/shared/asr-types.ts src/core/app-settings.ts src/core/ai/asr-runtime.ts src/core/ai/whisper-cpp-runtime.ts src/desktop/desktop-services.ts src/renderer/src/app/use-subtitle-derived.ts src/renderer/src/app/use-settings-actions.ts src/renderer/src/app/use-ai-setup.ts src/renderer/src/app/ai-setup-dialog.tsx src/renderer/src/app/settings-section-types.ts src/renderer/src/app/settings-dialog-model.ts src/renderer/src/app/settings-section-panels.tsx src/renderer/src/app/settings-sections/subtitles.tsx src/renderer/src/app/settings-sections/ai-service.tsx src/shared/i18n/locales/zh-CN.ts src/shared/i18n/locales/en-US.ts src/shared/i18n/locales/ja-JP.ts src/shared/i18n/locales/ko-KR.ts tests/unit/app-settings.test.ts tests/unit/asr-runtime-settings.test.ts
git rm src/renderer/src/app/translation-service-settings.tsx
git commit -m "feat(设置) : AI 服务升级为多配置档案并独立设置分类

edit by glm-5.3-flash"
```

> 注意：`src/preload/index.ts` 若 typecheck 要求 `AsrTranslationServiceTestRequest` 类型无变化则不需要改（类型是从 shared 再导出的）。如需改动（只允许类型再导出级别的微调），单独 add 并在 commit message 里说明。

---

### Task 3: UI 源码断言测试 + 文档 + 冒烟

**Files:**
- Test: `tests/unit/settings-ui-source.test.ts`
- Test: `tests/unit/dialog-smoke-source.test.ts`（如断言受影响）
- Modify: `FEATURE.md`

**Interfaces:**
- Consumes: Task 2 的最终文件布局（`settings-sections/ai-service.tsx` 存在、`translation-service-settings.tsx` 已删除）

- [ ] **Step 1: 更新 `tests/unit/settings-ui-source.test.ts`**

L117-179 用例 `routes subtitle display settings through shared settings controls`：
1. `settingsDialogSource` 的拼接里把 `src/renderer/src/app/translation-service-settings.tsx` 替换为 `src/renderer/src/app/settings-sections/ai-service.tsx`
2. 删除旧断言：L156-159 四条 `patchSettingsSection('asr', { translationBaseUrl... })` 等
3. L178 的 `expectInOrder(..., 'translationServiceTitle', "patchSettingsSection('asr', ...")` 删除
4. 追加新断言：

```ts
    const aiServiceSource = readSource('src/renderer/src/app/settings-sections/ai-service.tsx')
    const navSource = readSource('src/renderer/src/app/settings-dialog-model.ts')
    const subtitlesSectionOnly = readSource('src/renderer/src/app/settings-sections/subtitles.tsx')

    expect(navSource).toContain("{ id: 'ai', label: copy.settingsDialog.tabs.ai")
    expect(aiServiceSource).toContain("patchSettingsSection('ai', { activeProviderId })")
    expect(aiServiceSource).toContain('MANAGED_AI_PROVIDER_ID')
    expect(aiServiceSource).toContain('onTestTranslationService')
    expect(subtitlesSectionOnly).toContain('translationGlossary')
    expect(subtitlesSectionOnly).toContain("patchSettingsSection('asr', { translationGlossary: translationGlossary.trim() || null })")
```

保留原有的 fontSize/lineHeight/displayMode/targetLanguage 断言与 `translationBaseUrl` 等 copy key 断言（这些 key 仍存在于 ai-service.tsx / ai-setup-dialog.tsx 中）。若 L137-144 的 `settingsDialogSource` 拼接断言因文件替换后内容仍命中（ai-service.tsx 含 `translationBaseUrl` / `translationModel` / `translationApiKey` / `translationServiceCheck` 等字符串）则保留，否则按实际命中文件调整。

- [ ] **Step 2: 运行全量测试**

```bash
npm test
```

预期：全部 PASS。若 `dialog-smoke-source.test.ts` 或其他 source 断言测试引用了被删文件/旧字段，按同样方式更新断言（只允许改断言目标到新实现，不允许删除测试覆盖面）。

- [ ] **Step 3: 冒烟**

```bash
npm run smoke:settings-dialog:all
```

预期：四个语言截图生成、无报错；若脚本对 tab 顺序有断言则按新 tab 顺序调整脚本。

- [ ] **Step 4: FEATURE.md 增加功能记录**

在 FEATURE.md 追加一节（中文），内容要点：AI 服务从字幕设置独立为一级分类；支持多配置档案（内置托管 + 多个自定义 OpenAI-compatible），随时切换激活档案；旧的单服务配置自动迁移；apiKey 仍加密存储；AI 引导弹窗同步支持档案切换。

- [ ] **Step 5: Commit**

```bash
git add tests/unit/settings-ui-source.test.ts tests/unit/dialog-smoke-source.test.ts FEATURE.md
git commit -m "test(设置) : 补充 AI 服务设置源码断言与功能记录

edit by glm-5.3-flash"
```

---

## 手工验收清单（实现完成后）

1. 用旧版本 app-settings.json（schemaVersion 29，custom 模式）启动 → 打开设置，应看到「AI 服务」tab，旧自定义配置已成为一条档案且处于「使用中」
2. 新增一个自定义档案并填写错误 Key → 测试连接应失败且不落盘生效；保存后切换档案，翻译走新档案
3. 删除使用中的档案 → 自动回退内置托管，翻译可用
4. 切到日/韩/英语言，检查新 tab 名称与 aiService 文案无缺键（缺键表现为渲染报错或显示 key 名）
