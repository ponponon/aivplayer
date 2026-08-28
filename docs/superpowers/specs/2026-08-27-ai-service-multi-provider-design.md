# AI 服务独立设置分类 + 多配置档案 设计

日期：2026-08-27
状态：已批准（方案 A）

## 背景与目标

当前「AI 服务（翻译和总结）」配置挂在偏好设置的「字幕」分类下，且只支持单一配置（内置托管 / 自定义二选一）。目标：

1. AI 服务配置提升为独立的一级设置分类，排在「通用」之后第二位。
2. 支持多个配置档案（providers），可随时切换当前激活的档案；翻译、总结等所有 AI 功能统一使用激活档案。

## 数据结构（`src/shared/app-settings.ts`）

schemaVersion `29 → 30`。`ai` 段新增字段，`asr` 段删除旧字段：

```ts
ai: {
  openMode: 'cache-only' | 'ask' | 'guide' | 'complete'   // 现有字段，不动
  providers: ProviderProfile[]
  activeProviderId: string
}

type ProviderProfile = {
  id: string                    // 内置托管档案固定为 'managed'，自定义档案用 crypto.randomUUID()
  name: string                  // 必填；内置档案名「内置托管服务」
                                // 实现备注：托管档案 name 存空字符串，由 i18n 按界面语言回退显示（与初稿「内置托管服务」的差异是有意改进）
  kind: 'managed' | 'custom'
  baseUrl: string | null        // custom 用；managed 恒为 null
  model: string | null          // custom 用；managed 恒为 null
  apiKey: string | null         // custom 用；managed 恒为 null；落盘时经 safeStorage 加密（'safe:' 前缀）
}
```

删除的旧字段：`asr.translationServiceMode / translationBaseUrl / translationModel / translationApiKey`。
注意：`asr.translationGlossary`（术语表）数据字段保持原样不动，仅 UI 继续留在「字幕」tab。

## 迁移逻辑（schemaVersion 29 → 30）

检测到旧 `asr.translation*` 字段时：

- `translationServiceMode === 'custom'` → 生成一条自定义档案（名称「自定义服务」，继承旧 baseUrl / model / apiKey，apiKey 走现有 safeStorage 编码），设为激活。
- `translationServiceMode === 'managed'` → 激活内置托管档案。旧版 `managed` 模式下残留的自定义字段（旧 UI 切回 managed 时不会清空）在迁移时忽略，不生成自定义档案。
- `asr.translationGlossary` 保持不动。
- 迁移完成后清空旧的服务模式字段。

## sanitize 规则（`sanitizeAppSettings`）

- `providers` 为空时自动补内置托管档案。
- 内置托管档案（id `'managed'`）始终存在，且其 baseUrl / model / apiKey 强制置 null（防止伪造）。
- 档案按 id 去重；name 为空时回退默认名。
- `activeProviderId` 不指向任何档案时回退 `'managed'`。

## 主进程改造

- `whisper-cpp-runtime.ts` 的 `getTranslationServiceConfig()` 重写：从 `ai.providers` 按 `activeProviderId` 解析激活档案；managed 走托管端点并附加设备指纹 headers（`translationHeaders` 机制不动）；custom 取档案的 baseUrl / model / apiKey。env 变量 fallback（`AIVPLAYER_TRANSLATION_*`）保留。
- `desktop-services.ts` 的 `getAsrRuntime()` 注入点从 5 个平铺字段改为传整个 `ai` 段。
- `testTranslationService` IPC 改为接收 provider 配置参数，支持测试未保存的临时档案。
- 消费方（字幕翻译、总结、AI 工作流、批量字幕）全部经 `getTranslationServiceConfig` 单一入口，无需改动。

## UI 改造（renderer）

- `settings-dialog-model.ts`：导航新增 `ai`（lucide `sparkles` 图标，名称「AI 服务」），排在「通用」之后第二位；`AppSettingsSectionId` 增加 `'ai'`。
- 新组件 `ai-service-settings.tsx`：
  - 档案列表卡片：名称、类型徽标（内置托管 / 自定义）、当前激活标记、编辑 / 删除按钮（内置档案无编辑删除）。
  - 「设为当前使用」切换激活档案。
  - 新增 / 编辑表单：名称（必填，默认「自定义服务」）、API Base URL、模型名、API Key（密码框）、「测试连接」按钮。
  - 激活内置档案时显示「已启用内置托管服务」说明文案（沿用现有文案）。
  - 删除当前激活的自定义档案时自动回退到内置托管档案。
- 「字幕」tab：移除 `translation-service-settings.tsx` 区块，术语表保留原地。
- 短剧模块的独立 AI 配置（`drama.*`）不动。

## 范围外（明确不做）

- 不做主备/故障转移。
- 不做按用途（翻译 vs 总结）分别指定档案。
- 不改 `ai.openMode`、`drama.*`、TTS 等其他 AI 相关配置。

## 测试

- 单测：schema 29→30 迁移（custom / managed 两种模式、术语表迁移）；sanitize 边界（空列表、非法 activeProviderId、managed 档案被篡改、重复 id）。
- 按 `tests/unit/settings-ui-source.test.ts` 模式补设置 UI 源码断言。
- 手测：旧配置升级迁移、多档案切换后翻译生效、删除激活档案后回退。

## 实施与提交

分 3 阶段 commit：

1. `feat(settings)`: 数据层 schema 升级 + 迁移 + sanitize + 单测
2. `feat(ai)`: 主进程 getTranslationServiceConfig 重写 + 注入点改造
3. `feat(settings)`: UI 新 AI 服务 tab + 字幕 tab 清理 + UI 断言测试

收尾：FEATURE.md 增加功能记录。
