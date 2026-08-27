# 任务中心「删除单条记录」设计

日期：2026-08-27

## 需求

任务中心每条**终态**任务（completed / failed / cancelled）提供常驻垃圾桶小图标按钮，点击后将该条记录从列表删除，并同步删除本地持久化文件 `task-center.json` 中的对应记录。运行中/排队中任务不显示删除按钮（它们已有取消按钮）。

## 方案

采用全链路真删除（非仅前端隐藏），避免重启后记录「复活」：

1. **Store**（`src/core/tasks/task-center-store.ts`）：新增 `remove(id: string)`，从内存数组移除后走既有 `enqueueWrite` 原子落盘，与 `clearFinished` 同模式。
2. **IPC**：
   - `src/shared/ipc-channels.ts` 新增 `TASK_CENTER_REMOVE: 'task-center:remove'`
   - `src/desktop/ipc-task-center.ts` 注册 handler：`store.remove(id)` 后 `await store.flush()`
   - `src/preload/index.ts` 暴露 `removeTaskCenterEvent(id)`（`AivApi` 为 `typeof api` 推导，无需改类型声明）
3. **渲染层**：
   - `src/renderer/src/app/use-task-center.ts` 新增 `removeEvent(id)`：先调 IPC，持久化成功后再本地 filter（遵守「持久化成功后再更新本地」既有约定）
   - `src/renderer/src/app/task-center.tsx` `TaskRow`：终态任务在 retry/recreate 按钮之后渲染删除按钮；lucide `Trash2 size={12}`；class `.task-center-delete`，样式照抄 `.task-center-cancel`（20×20、border-soft、hover 变 `--danger`）；若前面没有任何动作按钮（如普通已完成任务），加 `is-first` 类补 `margin-left: auto` 推到行尾
4. **i18n**：zh-CN / en-US / ja-JP / ko-KR 的 `taskCenter` 段各加 `deleteTask` 文案（「删除记录」/ "Delete record" / 「記録を削除」/ 「기록 삭제」）。

## 边界情况

- 删除瞬间主进程又收到同 id 的终态事件推送 → `record` upsert 会把记录加回来，概率极低，可接受。
- Web 端（`src/web/web-panels.tsx`）是独立简化实现，本次不改。
- 删除按钮仅对终态显示：`!isTaskCenterActive(event.status)`。

## 测试

- `tests/unit/task-center-store.test.ts`：新增 `remove()` 单元测试（删除后内存与重载快照均不含该记录；删除不存在的 id 无副作用）。
- `tests/unit/task-center-source.test.ts`：补 `TASK_CENTER_REMOVE` / `removeTaskCenterEvent` / `task-center-delete` 接线断言。
