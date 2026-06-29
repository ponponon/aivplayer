# AGENTS.md - AI 代理协作指南

## 项目概述

AIVPlayer 是一款基于 Electron + React + TypeScript 的跨平台桌面视频播放器，核心特性是本地 AI 字幕生成（基于 whisper.cpp）。

**技术栈：** Electron, React 19, TypeScript, Vite, lucide-react, whisper.cpp, Vitest, Playwright

**项目结构：**
- `src/main/` - Electron 主进程
- `src/renderer/` - React 渲染进程
- `src/preload/` - 预加载脚本
- `src/shared/` - 共享类型定义
- `tests/` - 测试文件
- `scripts/` - 工具脚本

---

## 开发规范

### 代码风格

1. **TypeScript 严格模式** - 启用 `strict: true`，所有变量必须有类型声明
2. **函数式组件** - 使用 React 函数组件 + Hooks，不使用 class 组件
3. **图标规范** - 统一使用 `lucide-react` 图标库，**禁止使用 Emoji 当图标**
4. **CSS 规范** - 使用 design tokens（`tokens.css`），遵循现有样式模式
5. **导入规范** - 使用 `import type` 导入类型，保持导入语句整洁

### 测试要求

**修改代码后必须验证：**

```bash
npm run typecheck    # 类型检查
npm run test         # 单元测试
```

**新功能需添加测试：**
- 工具函数必须有单元测试
- React 组件可选添加测试
- 测试文件放在 `tests/unit/` 目录

### 提交规范

使用中文提交信息，格式：`<type>: <description>`

**类型说明：**
- `feat` - 新功能
- `fix` - 修复 bug
- `refactor` - 重构（不改变功能）
- `test` - 添加/修改测试
- `docs` - 文档更新
- `chore` - 构建/工具/依赖更新

**示例：**
```
feat: 添加播放列表功能
fix: 修复视频播放卡顿问题
refactor: 重构 ASR 模块
test: 添加时间格式化单元测试
docs: 更新 README 安装说明
```

---

## 代理行为约束

### 必须遵守

1. **先阅读代码** - 不要猜测，先查看现有实现
2. **遵循现有风格** - 新代码必须与项目风格一致
3. **不添加未请求功能** - 只实现用户明确要求的功能
4. **修改后验证** - 运行 `typecheck` 和 `test` 确保无误

### 禁止事项

1. **禁止使用 Emoji 当图标** - 使用 lucide-react 或内联 SVG
2. **禁止猜测 API** - 先查看 `node_modules` 确认库的用法
3. **禁止跳过类型检查** - 所有代码必须通过 TypeScript 严格模式
4. **禁止提交敏感信息** - 不要提交密钥、密码、token

### UI 开发规范

写 UI 代码前必须：

1. **查看 CSS/源码** - 了解组件的 DOM 结构和默认样式
2. **参考同类组件** - 保持与项目现有实现一致
3. **确认图标存在** - 在 `node_modules/lucide-react` 中确认图标名
4. **使用 design tokens** - 查看 `tokens.css` 了解可用的样式变量

写完后自查：边距、颜色、图标是否与项目已有实现一致。

---

## 常见任务指引

### 添加新图标

```tsx
// 1. 从 lucide-react 导入
import { NewIcon } from 'lucide-react'

// 2. 确认图标存在（检查 node_modules/lucide-react/dist）
// 3. 在组件中使用
<NewIcon size={17} />
```

### 修改 UI 样式

1. 先查看 `src/renderer/src/styles/tokens.css` 了解 design tokens
2. 参考现有组件的实现模式
3. 使用专业图标，不用 Emoji
4. 保持与项目风格一致

### 添加新的 IPC 通道

1. 在 `src/shared/ipc-channels.ts` 添加通道名
2. 在 `src/main/index.ts` 注册处理函数
3. 在 `src/preload/index.ts` 暴露 API
4. 在渲染进程中调用

### 添加新的类型定义

1. 在 `src/shared/media-types.ts` 添加类型
2. 使用 `import type` 导入
3. 确保类型命名清晰、有描述性

### 运行测试

```bash
# 运行所有测试
npm run test

# 运行特定测试文件
npm run test -- tests/unit/time.test.ts

# 监听模式
npm run test -- --watch
```

### 检查 ASR 运行时

```bash
# 检查 ASR 运行时状态
npm run doctor:asr

# 检查后端依赖
npm run doctor:backend
```

---

## 架构说明

### 主进程 (src/main/)

- `index.ts` - 应用入口，窗口管理，IPC 注册
- `ai/` - ASR 相关模块（whisper.cpp 集成）
- `media/` - 媒体播放模块（native-player, media-protocol）

### 渲染进程 (src/renderer/)

- `src/app/App.tsx` - 主应用组件
- `src/app/player-state.ts` - 播放状态管理
- `src/styles/` - 样式文件（tokens.css, base.css, player.css）

### 共享模块 (src/shared/)

- `ipc-channels.ts` - IPC 通道名常量
- `media-types.ts` - 媒体相关类型定义

---

## 故障排查

### 依赖安装失败

检查代理配置，运行 `~/.agents/instructions/script/test-proxy.sh` 测试代理可用性。

### ASR 模型下载失败

- 国内用户优先使用 ModelScope 源
- 海外用户使用 Hugging Face 源
- 检查网络代理配置

### 视频播放问题

- 检查视频格式是否支持
- 查看控制台错误信息
- 运行 `npm run doctor:backend` 检查后端状态
