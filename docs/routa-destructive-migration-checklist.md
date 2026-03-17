# Routa Destructive Migration Checklist

## Goal

Replace the current `team-ai` task orchestration model with a `routa`-aligned orchestration domain.

This is a destructive migration plan:

- no compatibility layer for old orchestration APIs
- local SQLite schema can be rebuilt from scratch
- old `task-run` and spec-first orchestration paths will be removed

## Phase 1

Goal: land the new `Kanban + background task` foundation in parallel with the old orchestration path so later cutover work has a stable target.

### Foundation Scope

- [x] Keep old orchestration routes untouched for this phase and introduce new foundation APIs in parallel
- [x] Read the `routa` task, background-task, and kanban orchestrator implementations before coding
- [x] Define Phase 1 as a foundation phase instead of forcing immediate destructive cutover

### Database Foundation

- [x] Add `project_kanban_boards` and `project_kanban_columns`
- [x] Add `project_background_tasks`
- [x] Keep old task tables in place during the foundation phase
- [ ] Add `task_lane_sessions` and `task_lane_handoffs`
- [ ] Replace the old task storage model with a Routa-style task table

### Foundation Services

- [x] Add `kanban-board-service.ts`
- [x] Add `background-task-service.ts`
- [x] Add kanban and background-task schemas
- [ ] Implement Routa-style `TaskStore`
- [ ] Implement `BackgroundWorker` with at least `dispatchPending` and `checkCompletions`
- [ ] Implement a Kanban column automation orchestrator aligned to [`routa/src/core/kanban/workflow-orchestrator.ts`](/Users/zhongjie/Documents/GitHub/team-ai/routa/src/core/kanban/workflow-orchestrator.ts)
- [ ] Bind worktree creation and session queueing to column transitions instead of old implement-task execution
- [x] Keep `agent-gateway` as the ACP/provider runtime boundary

### Foundation APIs

- [x] Add a minimal Kanban API surface
- [x] Add a minimal background-task API surface
- [x] Add kanban and background-task presenters plus vendor media types
- [ ] Replace task creation semantics so creating a task creates a board card
- [ ] Replace task update semantics so column transitions drive orchestration
- [ ] Remove `task-run` as a first-class execution API

### Validation

- [x] Add focused route tests for the new kanban and background-task APIs
- [ ] Add a minimal Kanban UI as the new task orchestration home
- [ ] Remove old task-run and orchestration-summary UI entrypoints
- [ ] Re-enable `nx` validation once the workspace stops failing project graph processing on `routa/docker/sandbox`

### Phase 1 Acceptance

- [x] A project can resolve a default workflow board through the new kanban API
- [x] A project can create and list background tasks through the new API
- [x] Focused route tests pass for the new foundation APIs
- [ ] Creating a task puts it directly into Kanban
- [ ] Entering an automation column starts or queues a session
- [ ] `/tasks/:id/execute` is no longer needed
- [ ] `task-run` is no longer the main execution object

## Phase 2

Goal: cut the application over from the old task orchestrator to the new foundation and make Kanban the primary execution path.

### Cutover

- [x] Deprecate and remove `/api/tasks/:taskId/execute`
- [x] Deprecate and remove `/api/task-runs/*`
- [x] Deprecate and remove `/api/projects/:projectId/orchestration-summary`
- [ ] Stop treating `spec-task-sync` as the main orchestration entrypoint: [`apps/local-server/src/app/services/spec-task-sync-service.ts`](/Users/zhongjie/Documents/GitHub/team-ai/apps/local-server/src/app/services/spec-task-sync-service.ts)
- [ ] Remove ACP plan to task compatibility path: [`apps/local-server/src/app/services/acp-plan-task-sync-service.ts`](/Users/zhongjie/Documents/GitHub/team-ai/apps/local-server/src/app/services/acp-plan-task-sync-service.ts)
- [ ] Replace task creation semantics so creating a task creates a board card
- [ ] Replace task update semantics so column transitions drive orchestration
- [x] Remove `task-run` as a first-class execution API
- [ ] Add a minimal Kanban UI as the new task orchestration home
- [ ] Remove old task-run and orchestration-summary UI entrypoints

### Workflow

- [x] Add `workflow_definitions` and `workflow_runs`
- [ ] Implement a workflow loader
- [ ] Implement a workflow executor aligned to [`routa/src/core/workflows/workflow-executor.ts`](/Users/zhongjie/Documents/GitHub/team-ai/routa/src/core/workflows/workflow-executor.ts)
- [x] Support `parallel_group` and step dependency execution
- [x] Add `/api/workflows`

### Schedule

- [x] Add `schedules`
- [x] Implement a schedule service
- [x] Add `/api/schedules`
- [x] Add local cron tick support or equivalent scheduler
- [x] Ensure schedules trigger workflows or background tasks, not ACP sessions directly

### Webhook

- [ ] Add webhook configuration and logs
- [ ] Add `/api/webhooks/configs`
- [ ] Add `/api/webhooks/github`
- [ ] Add `/api/webhooks/webhook-logs`
- [ ] Ensure webhooks trigger workflows or background tasks, not ACP sessions directly

### Trace And Context

- [ ] Add trace storage and trace API
- [ ] Add session context, lane handoff, artifact, and worktree views
- [ ] Add settings surfaces for workflows, schedules, and webhooks

### Phase 2 Acceptance

- [ ] Workflows can create and advance background tasks
- [ ] Schedules can trigger workflows automatically
- [ ] Webhooks can trigger workflows automatically
- [ ] UI can inspect board, workflow, schedule, webhook, and trace objects

## File-Level Execution Order

### Stage 1: Database And Storage

- [x] Rework SQLite schema bootstrap via migrations: [`apps/local-server/src/app/db/migrations.ts`](/Users/zhongjie/Documents/GitHub/team-ai/apps/local-server/src/app/db/migrations.ts)
- [ ] Rework SQLite bootstrap policy if/when destructive reset is introduced: [`apps/local-server/src/app/db/sqlite.ts`](/Users/zhongjie/Documents/GitHub/team-ai/apps/local-server/src/app/db/sqlite.ts)
- [ ] Update migration/bootstrap support if still used: [`apps/local-server/src/app/db/migrations.ts`](/Users/zhongjie/Documents/GitHub/team-ai/apps/local-server/src/app/db/migrations.ts)
- [x] Update schema tests: [`apps/local-server/src/app/db/sqlite.test.ts`](/Users/zhongjie/Documents/GitHub/team-ai/apps/local-server/src/app/db/sqlite.test.ts)

### Stage 2: Schemas

- [x] Replace task schema: [`apps/local-server/src/app/schemas/task.ts`](/Users/zhongjie/Documents/GitHub/team-ai/apps/local-server/src/app/schemas/task.ts)
- [x] Add `kanban.ts`: [`apps/local-server/src/app/schemas/kanban.ts`](/Users/zhongjie/Documents/GitHub/team-ai/apps/local-server/src/app/schemas/kanban.ts)
- [x] Add `background-task.ts`: [`apps/local-server/src/app/schemas/background-task.ts`](/Users/zhongjie/Documents/GitHub/team-ai/apps/local-server/src/app/schemas/background-task.ts)
- [x] Add `workflow.ts`: [`apps/local-server/src/app/schemas/workflow.ts`](/Users/zhongjie/Documents/GitHub/team-ai/apps/local-server/src/app/schemas/workflow.ts)
- [x] Add `schedule.ts`: [`apps/local-server/src/app/schemas/schedule.ts`](/Users/zhongjie/Documents/GitHub/team-ai/apps/local-server/src/app/schemas/schedule.ts)
- [ ] Add `webhook.ts`: [`apps/local-server/src/app/schemas/webhook.ts`](/Users/zhongjie/Documents/GitHub/team-ai/apps/local-server/src/app/schemas/webhook.ts)
- [ ] Remove or retire `task-run.ts`: [`apps/local-server/src/app/schemas/task-run.ts`](/Users/zhongjie/Documents/GitHub/team-ai/apps/local-server/src/app/schemas/task-run.ts)

### Stage 3: Task And Kanban Services

- [x] Rewrite task persistence and query logic: [`apps/local-server/src/app/services/task-service.ts`](/Users/zhongjie/Documents/GitHub/team-ai/apps/local-server/src/app/services/task-service.ts)
- [ ] Replace old workflow context helper: [`apps/local-server/src/app/services/task-workflow-service.ts`](/Users/zhongjie/Documents/GitHub/team-ai/apps/local-server/src/app/services/task-workflow-service.ts)
- [x] Rewrite task service tests: [`apps/local-server/src/app/services/task-service.test.ts`](/Users/zhongjie/Documents/GitHub/team-ai/apps/local-server/src/app/services/task-service.test.ts)
- [x] Add `kanban-board-service.ts`: [`apps/local-server/src/app/services/kanban-board-service.ts`](/Users/zhongjie/Documents/GitHub/team-ai/apps/local-server/src/app/services/kanban-board-service.ts)
- [x] Add `task-lane-service.ts`: [`apps/local-server/src/app/services/task-lane-service.ts`](/Users/zhongjie/Documents/GitHub/team-ai/apps/local-server/src/app/services/task-lane-service.ts)
- [x] Add `kanban-event-service.ts`: [`apps/local-server/src/app/services/kanban-event-service.ts`](/Users/zhongjie/Documents/GitHub/team-ai/apps/local-server/src/app/services/kanban-event-service.ts)
- [x] Add `kanban-workflow-orchestrator-service.ts`: [`apps/local-server/src/app/services/kanban-workflow-orchestrator-service.ts`](/Users/zhongjie/Documents/GitHub/team-ai/apps/local-server/src/app/services/kanban-workflow-orchestrator-service.ts)
- [ ] Reuse worktree support from [`apps/local-server/src/app/services/project-worktree-service.ts`](/Users/zhongjie/Documents/GitHub/team-ai/apps/local-server/src/app/services/project-worktree-service.ts)

### Stage 4: Background Execution

- [x] Add `background-task-service.ts`: [`apps/local-server/src/app/services/background-task-service.ts`](/Users/zhongjie/Documents/GitHub/team-ai/apps/local-server/src/app/services/background-task-service.ts)
- [x] Add `background-worker-service.ts`: [`apps/local-server/src/app/services/background-worker-service.ts`](/Users/zhongjie/Documents/GitHub/team-ai/apps/local-server/src/app/services/background-worker-service.ts)
- [ ] Reuse ACP session integration from [`apps/local-server/src/app/services/acp-service.ts`](/Users/zhongjie/Documents/GitHub/team-ai/apps/local-server/src/app/services/acp-service.ts)
- [ ] Keep runtime client boundary intact: [`apps/local-server/src/app/clients/acp-runtime-client.ts`](/Users/zhongjie/Documents/GitHub/team-ai/apps/local-server/src/app/clients/acp-runtime-client.ts)
- [ ] Retire old task execution runtime: [`apps/local-server/src/app/services/task-execution-runtime-service.ts`](/Users/zhongjie/Documents/GitHub/team-ai/apps/local-server/src/app/services/task-execution-runtime-service.ts)

### Stage 5: Remove Old Orchestration Core

- [ ] Remove plugin wiring for old orchestrator: [`apps/local-server/src/app/plugins/task-workflow-orchestrator.ts`](/Users/zhongjie/Documents/GitHub/team-ai/apps/local-server/src/app/plugins/task-workflow-orchestrator.ts)
- [ ] Remove old orchestrator implementation: [`apps/local-server/src/app/services/task-workflow-orchestrator-service.ts`](/Users/zhongjie/Documents/GitHub/team-ai/apps/local-server/src/app/services/task-workflow-orchestrator-service.ts)
- [ ] Remove old dispatch policy: [`apps/local-server/src/app/services/task-dispatch-policy-service.ts`](/Users/zhongjie/Documents/GitHub/team-ai/apps/local-server/src/app/services/task-dispatch-policy-service.ts)
- [ ] Remove old dispatch service: [`apps/local-server/src/app/services/task-dispatch-service.ts`](/Users/zhongjie/Documents/GitHub/team-ai/apps/local-server/src/app/services/task-dispatch-service.ts)
- [ ] Remove old orchestration service: [`apps/local-server/src/app/services/task-orchestration-service.ts`](/Users/zhongjie/Documents/GitHub/team-ai/apps/local-server/src/app/services/task-orchestration-service.ts)

### Stage 6: Routes

- [x] Replace task route semantics: [`apps/local-server/src/app/routes/tasks.ts`](/Users/zhongjie/Documents/GitHub/team-ai/apps/local-server/src/app/routes/tasks.ts)
- [x] Remove task-run routes: [`apps/local-server/src/app/routes/task-runs.ts`](/Users/zhongjie/Documents/GitHub/team-ai/apps/local-server/src/app/routes/task-runs.ts)
- [x] Add `kanban.ts`: [`apps/local-server/src/app/routes/kanban.ts`](/Users/zhongjie/Documents/GitHub/team-ai/apps/local-server/src/app/routes/kanban.ts)
- [x] Add `background-tasks.ts`: [`apps/local-server/src/app/routes/background-tasks.ts`](/Users/zhongjie/Documents/GitHub/team-ai/apps/local-server/src/app/routes/background-tasks.ts)
- [x] Add `workflows.ts`: [`apps/local-server/src/app/routes/workflows.ts`](/Users/zhongjie/Documents/GitHub/team-ai/apps/local-server/src/app/routes/workflows.ts)
- [x] Add `schedules.ts`: [`apps/local-server/src/app/routes/schedules.ts`](/Users/zhongjie/Documents/GitHub/team-ai/apps/local-server/src/app/routes/schedules.ts)
- [ ] Add `webhooks.ts`: [`apps/local-server/src/app/routes/webhooks.ts`](/Users/zhongjie/Documents/GitHub/team-ai/apps/local-server/src/app/routes/webhooks.ts)
- [ ] Register new routes in [`apps/local-server/src/app/app.ts`](/Users/zhongjie/Documents/GitHub/team-ai/apps/local-server/src/app/app.ts)

### Stage 7: MCP Tooling

- [ ] Rewrite task MCP handlers: [`apps/local-server/src/app/mcp/tool-handlers/task-handlers.ts`](/Users/zhongjie/Documents/GitHub/team-ai/apps/local-server/src/app/mcp/tool-handlers/task-handlers.ts)
- [ ] Rewrite agent MCP handlers: [`apps/local-server/src/app/mcp/tool-handlers/agent-handlers.ts`](/Users/zhongjie/Documents/GitHub/team-ai/apps/local-server/src/app/mcp/tool-handlers/agent-handlers.ts)
- [ ] Add `kanban-tools.ts`: [`apps/local-server/src/app/mcp/tool-catalog/kanban-tools.ts`](/Users/zhongjie/Documents/GitHub/team-ai/apps/local-server/src/app/mcp/tool-catalog/kanban-tools.ts)
- [ ] Add `workflow-tools.ts`: [`apps/local-server/src/app/mcp/tool-catalog/workflow-tools.ts`](/Users/zhongjie/Documents/GitHub/team-ai/apps/local-server/src/app/mcp/tool-catalog/workflow-tools.ts)

### Stage 8: Presenters

- [ ] Remove `task-run-presenter.ts`: [`apps/local-server/src/app/presenters/task-run-presenter.ts`](/Users/zhongjie/Documents/GitHub/team-ai/apps/local-server/src/app/presenters/task-run-presenter.ts)
- [x] Add `kanban-presenter.ts`: [`apps/local-server/src/app/presenters/kanban-presenter.ts`](/Users/zhongjie/Documents/GitHub/team-ai/apps/local-server/src/app/presenters/kanban-presenter.ts)
- [x] Add `background-task-presenter.ts`: [`apps/local-server/src/app/presenters/background-task-presenter.ts`](/Users/zhongjie/Documents/GitHub/team-ai/apps/local-server/src/app/presenters/background-task-presenter.ts)
- [x] Add `workflow-presenter.ts`: [`apps/local-server/src/app/presenters/workflow-presenter.ts`](/Users/zhongjie/Documents/GitHub/team-ai/apps/local-server/src/app/presenters/workflow-presenter.ts)
- [ ] Clean old media types in [`apps/local-server/src/app/vendor-media-types.ts`](/Users/zhongjie/Documents/GitHub/team-ai/apps/local-server/src/app/vendor-media-types.ts)

### Stage 9: Frontend

- [ ] Add `kanban-page.tsx`: [`apps/web/src/features/kanban/kanban-page.tsx`](/Users/zhongjie/Documents/GitHub/team-ai/apps/web/src/features/kanban/kanban-page.tsx)
- [ ] Add `background-task-panel.tsx`: [`apps/web/src/features/background-tasks/background-task-panel.tsx`](/Users/zhongjie/Documents/GitHub/team-ai/apps/web/src/features/background-tasks/background-task-panel.tsx)
- [ ] Add `workflow-page.tsx`: [`apps/web/src/features/workflows/workflow-page.tsx`](/Users/zhongjie/Documents/GitHub/team-ai/apps/web/src/features/workflows/workflow-page.tsx)
- [ ] Add `schedule-page.tsx`: [`apps/web/src/features/schedules/schedule-page.tsx`](/Users/zhongjie/Documents/GitHub/team-ai/apps/web/src/features/schedules/schedule-page.tsx)
- [ ] Remove old orchestration-summary and task-run entrypoints
- [ ] Update API client wiring: [`apps/web/src/lib/api-client.ts`](/Users/zhongjie/Documents/GitHub/team-ai/apps/web/src/lib/api-client.ts)

### Stage 10: Phase 2 Services

- [ ] Add `workflow-loader-service.ts`: [`apps/local-server/src/app/services/workflow-loader-service.ts`](/Users/zhongjie/Documents/GitHub/team-ai/apps/local-server/src/app/services/workflow-loader-service.ts)
- [ ] Add `workflow-executor-service.ts`: [`apps/local-server/src/app/services/workflow-executor-service.ts`](/Users/zhongjie/Documents/GitHub/team-ai/apps/local-server/src/app/services/workflow-executor-service.ts)
- [x] Add `scheduler-service.ts`: [`apps/local-server/src/app/services/scheduler-service.ts`](/Users/zhongjie/Documents/GitHub/team-ai/apps/local-server/src/app/services/scheduler-service.ts)
- [ ] Add `webhook-service.ts`: [`apps/local-server/src/app/services/webhook-service.ts`](/Users/zhongjie/Documents/GitHub/team-ai/apps/local-server/src/app/services/webhook-service.ts)
- [ ] Add `trace-service.ts`: [`apps/local-server/src/app/services/trace-service.ts`](/Users/zhongjie/Documents/GitHub/team-ai/apps/local-server/src/app/services/trace-service.ts)

## Final Deletions

- [ ] Remove [`apps/local-server/src/app/services/spec-task-sync-service.ts`](/Users/zhongjie/Documents/GitHub/team-ai/apps/local-server/src/app/services/spec-task-sync-service.ts)
- [ ] Remove [`apps/local-server/src/app/services/task-workflow-orchestrator-service.ts`](/Users/zhongjie/Documents/GitHub/team-ai/apps/local-server/src/app/services/task-workflow-orchestrator-service.ts)
- [ ] Remove [`apps/local-server/src/app/services/task-dispatch-policy-service.ts`](/Users/zhongjie/Documents/GitHub/team-ai/apps/local-server/src/app/services/task-dispatch-policy-service.ts)
- [ ] Remove [`apps/local-server/src/app/services/task-dispatch-service.ts`](/Users/zhongjie/Documents/GitHub/team-ai/apps/local-server/src/app/services/task-dispatch-service.ts)
- [ ] Remove [`apps/local-server/src/app/services/task-orchestration-service.ts`](/Users/zhongjie/Documents/GitHub/team-ai/apps/local-server/src/app/services/task-orchestration-service.ts)
- [ ] Remove [`apps/local-server/src/app/services/task-execution-runtime-service.ts`](/Users/zhongjie/Documents/GitHub/team-ai/apps/local-server/src/app/services/task-execution-runtime-service.ts)
- [ ] Remove old `task-run` routes, schemas, presenters, and tests

## Progress Notes

### Phase 2

- [x] Read `routa` task route and Kanban transition implementations before the cutover
- [x] Rewrite [`apps/local-server/src/app/routes/tasks.ts`](/Users/zhongjie/Documents/GitHub/team-ai/apps/local-server/src/app/routes/tasks.ts) to keep task HTTP semantics limited to CRUD/card operations
- [x] Remove task presenter links that exposed execute, run, and orchestration-summary actions
- [x] Delete [`apps/local-server/src/app/routes/task-runs.ts`](/Users/zhongjie/Documents/GitHub/team-ai/apps/local-server/src/app/routes/task-runs.ts) and its route tests
- [x] Validate focused route and presenter coverage with `npx vitest run src/app/routes/tasks.test.ts src/app/routes/projects.test.ts src/app/routes/kanban.test.ts src/app/routes/background-tasks.test.ts src/app/presenters/task-presenter.test.ts`
- [ ] Clear the remaining pre-existing TypeScript error in [`apps/local-server/src/app/services/task-dispatch-service.ts`](/Users/zhongjie/Documents/GitHub/team-ai/apps/local-server/src/app/services/task-dispatch-service.ts)

### Phase 3

- [x] Read `routa` task model, `TaskStore`, and SQLite task store implementations before changing local persistence
- [x] Add a new migration to persist Routa-style task metadata on `project_tasks`
- [x] Expand [`apps/local-server/src/app/schemas/task.ts`](/Users/zhongjie/Documents/GitHub/team-ai/apps/local-server/src/app/schemas/task.ts) with `workspaceId`, `sessionIds`, `laneSessions`, `laneHandoffs`, and `codebaseIds`
- [x] Dual-write Routa task metadata in [`apps/local-server/src/app/services/task-service.ts`](/Users/zhongjie/Documents/GitHub/team-ai/apps/local-server/src/app/services/task-service.ts) while preserving legacy fields needed by unfinished orchestration services
- [x] Update schema, service, route, and presenter tests with `npx vitest run src/app/db/sqlite.test.ts src/app/services/task-service.test.ts src/app/routes/tasks.test.ts src/app/presenters/task-presenter.test.ts`
- [ ] Remove the remaining pre-existing TypeScript error in [`apps/local-server/src/app/services/task-dispatch-service.ts`](/Users/zhongjie/Documents/GitHub/team-ai/apps/local-server/src/app/services/task-dispatch-service.ts)

### Phase 4

- [x] Read `routa` lane history, Kanban session queue, and workflow orchestrator implementations before coding
- [x] Add [`apps/local-server/src/app/services/task-lane-service.ts`](/Users/zhongjie/Documents/GitHub/team-ai/apps/local-server/src/app/services/task-lane-service.ts) for Routa-style lane session and handoff history mutations
- [x] Add [`apps/local-server/src/app/services/kanban-event-service.ts`](/Users/zhongjie/Documents/GitHub/team-ai/apps/local-server/src/app/services/kanban-event-service.ts) as the local event bus for task column transitions and background task completion
- [x] Add [`apps/local-server/src/app/services/kanban-workflow-orchestrator-service.ts`](/Users/zhongjie/Documents/GitHub/team-ai/apps/local-server/src/app/services/kanban-workflow-orchestrator-service.ts) to queue background tasks for automated columns and auto-advance successful review lanes
- [x] Validate the new services with `npx vitest run src/app/services/task-lane-service.test.ts src/app/services/kanban-workflow-orchestrator-service.test.ts`
- [ ] Remove the remaining pre-existing TypeScript error in [`apps/local-server/src/app/services/task-dispatch-service.ts`](/Users/zhongjie/Documents/GitHub/team-ai/apps/local-server/src/app/services/task-dispatch-service.ts)

### Phase 5

- [x] Read `routa` background worker and background-task store implementations before coding
- [x] Extend [`apps/local-server/src/app/services/background-task-service.ts`](/Users/zhongjie/Documents/GitHub/team-ai/apps/local-server/src/app/services/background-task-service.ts) with ready/running/session lookup and status update helpers for worker execution
- [x] Add [`apps/local-server/src/app/services/background-worker-service.ts`](/Users/zhongjie/Documents/GitHub/team-ai/apps/local-server/src/app/services/background-worker-service.ts) with `dispatchPending` and `checkCompletions`
- [x] Validate the worker path with `npx vitest run src/app/services/background-worker-service.test.ts src/app/routes/background-tasks.test.ts`
- [ ] Reuse ACP session integration from [`apps/local-server/src/app/services/acp-service.ts`](/Users/zhongjie/Documents/GitHub/team-ai/apps/local-server/src/app/services/acp-service.ts)
- [ ] Remove the remaining pre-existing TypeScript error in [`apps/local-server/src/app/services/task-dispatch-service.ts`](/Users/zhongjie/Documents/GitHub/team-ai/apps/local-server/src/app/services/task-dispatch-service.ts)

### Phase 6

- [x] Read `routa` workflow executor and workflow/schedule route implementations before coding
- [x] Add workflow schema, SQLite tables, and presenter support for definitions and runs
- [x] Add [`apps/local-server/src/app/services/workflow-service.ts`](/Users/zhongjie/Documents/GitHub/team-ai/apps/local-server/src/app/services/workflow-service.ts) to create workflow definitions, create runs, and expand workflow steps into background tasks
- [x] Add [`apps/local-server/src/app/routes/workflows.ts`](/Users/zhongjie/Documents/GitHub/team-ai/apps/local-server/src/app/routes/workflows.ts) for workflow CRUD-lite and trigger endpoints
- [x] Validate workflow schema, service, and route coverage with `npx vitest run src/app/db/sqlite.test.ts src/app/services/workflow-service.test.ts src/app/routes/workflows.test.ts`
- [ ] Implement a dedicated workflow loader service
- [ ] Remove the remaining pre-existing TypeScript error in [`apps/local-server/src/app/services/task-dispatch-service.ts`](/Users/zhongjie/Documents/GitHub/team-ai/apps/local-server/src/app/services/task-dispatch-service.ts)

### Phase 7

- [x] Read `routa` schedule route, store, and cron utility implementations before coding
- [x] Add schedule schema, SQLite table, and presenter support for workflow-backed schedules
- [x] Add [`apps/local-server/src/app/services/schedule-service.ts`](/Users/zhongjie/Documents/GitHub/team-ai/apps/local-server/src/app/services/schedule-service.ts) to persist schedules and turn due schedules into workflow runs
- [x] Add [`apps/local-server/src/app/routes/schedules.ts`](/Users/zhongjie/Documents/GitHub/team-ai/apps/local-server/src/app/routes/schedules.ts) with list/create/detail/tick endpoints
- [x] Validate schedule schema, service, and route coverage with `npx vitest run src/app/db/sqlite.test.ts src/app/services/schedule-service.test.ts src/app/routes/schedules.test.ts`
- [ ] Add a local scheduler service that calls the tick endpoint or service periodically
- [ ] Remove the remaining pre-existing TypeScript error in [`apps/local-server/src/app/services/task-dispatch-service.ts`](/Users/zhongjie/Documents/GitHub/team-ai/apps/local-server/src/app/services/task-dispatch-service.ts)

### Phase 8

- [x] Read `routa` in-process scheduler service and current Fastify plugin wiring before coding
- [x] Add [`apps/local-server/src/app/services/scheduler-service.ts`](/Users/zhongjie/Documents/GitHub/team-ai/apps/local-server/src/app/services/scheduler-service.ts) to manage periodic schedule ticks without overlapping runs
- [x] Add [`apps/local-server/src/app/plugins/scheduler.ts`](/Users/zhongjie/Documents/GitHub/team-ai/apps/local-server/src/app/plugins/scheduler.ts) and register it in [`apps/local-server/src/app/app.ts`](/Users/zhongjie/Documents/GitHub/team-ai/apps/local-server/src/app/app.ts)
- [x] Validate scheduler service and plugin coverage with `npx vitest run src/app/services/scheduler-service.test.ts src/app/plugins/scheduler.test.ts`
- [ ] Wire the scheduler to explicit desktop/runtime settings if runtime configurability becomes necessary
- [ ] Remove the remaining pre-existing TypeScript error in [`apps/local-server/src/app/services/task-dispatch-service.ts`](/Users/zhongjie/Documents/GitHub/team-ai/apps/local-server/src/app/services/task-dispatch-service.ts)
