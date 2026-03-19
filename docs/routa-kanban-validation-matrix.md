# Routa Kanban 验证命令矩阵

## M1

目标：默认 workflow board、board projection、Kanban 页面、显式 move card。

精准回归：

```bash
pnpm vitest \
  apps/local-server/src/app/routes/kanban.test.ts \
  apps/local-server/src/app/routes/tasks.test.ts \
  apps/local-server/src/app/services/kanban-workflow-orchestrator-service.test.ts

pnpm exec vitest --config apps/web/vite.config.ts \
  apps/web/src/features/projects/project-kanban-page.spec.tsx

pnpm exec tsc -p apps/local-server/tsconfig.app.json --noEmit
pnpm exec tsc -p apps/web/tsconfig.app.json --noEmit
pnpm exec tsc -p libs/frontend/features/projects/tsconfig.lib.json --noEmit
pnpm exec vite build --config apps/web/vite.config.ts
```

## M2

目标：spec sync、列角色闭环、自动推进与 explain 能力。

精准回归：

```bash
pnpm vitest \
  apps/local-server/src/app/routes/kanban.test.ts \
  apps/local-server/src/app/routes/tasks.test.ts \
  apps/local-server/src/app/services/kanban-workflow-orchestrator-service.test.ts

pnpm exec vitest --config apps/web/vite.config.ts \
  apps/web/src/features/projects/project-kanban-page.spec.tsx

pnpm exec tsc -p apps/local-server/tsconfig.app.json --noEmit
pnpm exec tsc -p apps/web/tsconfig.app.json --noEmit
pnpm exec tsc -p libs/frontend/features/projects/tsconfig.lib.json --noEmit
```

## M3

目标：board 配置化、MCP card 操作、设置页与拖拽体验。

精准回归：

```bash
pnpm vitest \
  apps/local-server/src/app/routes/kanban.test.ts \
  apps/local-server/src/app/routes/mcp.test.ts \
  apps/local-server/src/app/routes/specialists.test.ts

pnpm exec vitest --config apps/web/vite.config.ts \
  apps/web/src/features/projects/project-kanban-page.spec.tsx \
  apps/web/src/features/projects/project-kanban-settings-page.spec.tsx

pnpm exec tsc -p apps/local-server/tsconfig.app.json --noEmit
pnpm exec tsc -p apps/web/tsconfig.app.json --noEmit
pnpm exec tsc -p libs/frontend/features/projects/tsconfig.lib.json --noEmit
```

## M4

目标：goal intake、specialist CRUD、realtime、policy、external triggers、memory/traces。

精准回归：

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

pnpm exec vitest --config apps/web/vite.config.ts \
  apps/web/src/features/projects/project-kanban-page.spec.tsx \
  apps/web/src/features/projects/project-kanban-settings-page.spec.tsx

pnpm exec tsc -p apps/local-server/tsconfig.app.json --noEmit
pnpm exec tsc -p apps/web/tsconfig.app.json --noEmit
pnpm exec tsc -p libs/frontend/features/projects/tsconfig.lib.json --noEmit
```

## 推荐 Nx 组合

按项目跑主要 target：

```bash
npx nx run-many -t test --projects=local-server,@web/main,@features/projects
npx nx run-many -t typecheck --projects=local-server,@web/main,@features/projects
npx nx run-many -t build --projects=local-server,@web/main
```

单项目入口：

```bash
npx nx run local-server:test
npx nx run local-server:typecheck
npx nx run local-server:build

npx nx run @web/main:test
npx nx run @web/main:typecheck
npx nx run @web/main:build

npx nx run @features/projects:test
npx nx run @features/projects:typecheck
```

## 主要路径 Smoke Test

1. 进入项目 Kanban 页，确认可以加载默认 board projection。
2. 提交一个 `New Goal`，确认 note/spec/cards 同步完成。
3. 进入设置页创建一个自定义 specialist，并绑定到 `Todo` 或 `Blocked` 列。
4. 手动移动一张卡，确认合法迁移成功，非法迁移返回 policy reason。
5. 触发一次 schedule tick 或 webhook，确认 board 收到更新。
6. 打开卡片详情，确认 lane sessions、handoffs、memory、trace timeline 都可见。
