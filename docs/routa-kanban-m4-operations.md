# Routa Kanban M4 操作与验证说明

## 范围

`M4` 为当前看板体系补齐了 6 个能力：

- 自然语言 goal intake
- specialist CRUD 与 board 绑定
- board realtime event stream
- WIP / entry policy enforcement
- webhook / schedule -> Kanban 映射
- card memory 与 trace drill-down

## 使用流程

### 1. 从目标直接产卡

- 进入项目看板页。
- 点击 `New Goal`。
- 输入目标、约束、验收提示和 artifact hints。
- 提交后系统会：
  - 生成 intake note
  - 产出 spec fragment
  - 同步对应 cards 到 board

适用入口：

- [project-kanban-page.tsx](/Users/zhongjie/Documents/GitHub/team-ai/apps/web/src/features/projects/project-kanban-page.tsx)
- [kanban.ts](/Users/zhongjie/Documents/GitHub/team-ai/apps/local-server/src/app/routes/kanban.ts)

### 2. 管理 specialist 与列绑定

- 进入看板设置页。
- 创建或导入 specialist。
- 在 board column automation 中通过下拉列表选择 specialist。
- 如果 specialist 已被列引用，删除会返回冲突，需先解除绑定。

适用入口：

- [project-kanban-settings-page.tsx](/Users/zhongjie/Documents/GitHub/team-ai/apps/web/src/features/projects/project-kanban-settings-page.tsx)
- [specialists.ts](/Users/zhongjie/Documents/GitHub/team-ai/apps/local-server/src/app/routes/specialists.ts)

### 3. 观察实时协作状态

- 看板页会订阅 board 级 SSE 流。
- 卡片移动、自动推进、外部触发更新后，页面会自动刷新。
- 页面右上方会显示最近一次 realtime event 时间。

适用入口：

- [project-kanban-page.tsx](/Users/zhongjie/Documents/GitHub/team-ai/apps/web/src/features/projects/project-kanban-page.tsx)
- [kanban-event-stream.ts](/Users/zhongjie/Documents/GitHub/team-ai/apps/local-server/src/app/routes/kanban-event-stream.ts)

### 4. 理解 policy 阻塞

- UI 在发送 move 请求前会先做本地 policy 预判。
- 服务端会再次执行 board-level 与 column-level policy。
- 被阻止时，用户可以直接看到 violation reason，而不是得到无上下文失败。

适用入口：

- [project-kanban-page.tsx](/Users/zhongjie/Documents/GitHub/team-ai/apps/web/src/features/projects/project-kanban-page.tsx)
- [task-service.ts](/Users/zhongjie/Documents/GitHub/team-ai/apps/local-server/src/app/services/task-service.ts)

### 5. 接入 schedule 与 webhook

- GitHub webhook 可以创建或更新 backlog/review card。
- schedule tick 可以触发 backlog hygiene / refinement 类工作。
- 卡片保留 `sourceType`、GitHub 关联字段和 trigger source，便于追踪来源。

适用入口：

- [webhooks.ts](/Users/zhongjie/Documents/GitHub/team-ai/apps/local-server/src/app/routes/webhooks.ts)
- [schedules.ts](/Users/zhongjie/Documents/GitHub/team-ai/apps/local-server/src/app/routes/schedules.ts)

### 6. 回看 card memory 与 traces

- 在卡片详情里查看 `Decisions`、`Blockers`、`Resolved`、`Done Summary`。
- 通过 `Trace Timeline` 查看相关 session 的 trace 聚合信息。
- 需要深入时，可按 task 过滤 traces。

适用入口：

- [project-kanban-page.tsx](/Users/zhongjie/Documents/GitHub/team-ai/apps/web/src/features/projects/project-kanban-page.tsx)
- [traces.ts](/Users/zhongjie/Documents/GitHub/team-ai/apps/local-server/src/app/routes/traces.ts)
- [kanban-card-memory-service.ts](/Users/zhongjie/Documents/GitHub/team-ai/apps/local-server/src/app/services/kanban-card-memory-service.ts)

## M4 回归命令

后端：

```bash
pnpm vitest \
  apps/local-server/src/app/routes/kanban.test.ts \
  apps/local-server/src/app/routes/specialists.test.ts \
  apps/local-server/src/app/routes/webhooks.test.ts \
  apps/local-server/src/app/routes/schedules.test.ts \
  apps/local-server/src/app/routes/traces.test.ts \
  apps/local-server/src/app/services/session-context-service.test.ts \
  apps/local-server/src/app/routes/acp-session-context.test.ts \
  apps/local-server/src/app/routes/mcp.test.ts
```

前端：

```bash
pnpm exec vitest --config apps/web/vite.config.ts \
  apps/web/src/features/projects/project-kanban-page.spec.tsx \
  apps/web/src/features/projects/project-kanban-settings-page.spec.tsx
```

类型检查：

```bash
pnpm exec tsc -p apps/local-server/tsconfig.app.json --noEmit
pnpm exec tsc -p apps/web/tsconfig.app.json --noEmit
pnpm exec tsc -p libs/frontend/features/projects/tsconfig.lib.json --noEmit
```

## Smoke Test

1. 新建一个自然语言 goal，并确认 board 上出现新卡。
2. 在设置页创建一个自定义 specialist，并绑定到某列。
3. 触发一次卡片移动，确认 policy 合法时成功、非法时给出原因。
4. 发送一次 webhook 或 tick schedule，确认 board 自动刷新。
5. 打开卡片详情，确认 memory 与 trace timeline 可见。
