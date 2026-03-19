# Routa 看板落地待办清单

## 目标

把当前项目中已经存在的任务编排、lane session、artifact gate、handoff 能力，落地成接近 Routa 的“Kanban 即协作中枢”体验。

完成后应满足：

- 用户可以从项目页面直接看到真正的看板，而不是统计摘要
- Spec 或用户意图可以稳定地产生、同步、更新卡片
- 卡片在 Backlog / Todo / Dev / Review / Blocked / Done 中流转
- 每一列可以绑定 specialist / provider / 自动化策略
- Agent 能通过 MCP 直接操作看板卡片，而不是只做 lane handoff

## 当前缺口

- [x] 看板前端仍是摘要卡片，不是列式看板主界面
- [ ] Spec 到卡片没有稳定同步闭环
- [x] 默认持久化 board 缺少 `Blocked` 列
- [ ] 列与 specialist 的绑定还不完整
- [ ] Kanban REST API 基本是只读
- [ ] Kanban MCP tool 只有 handoff，没有 card 级操作
- [x] Board 资源没有直接投影每列下的 cards

## P0

### 1. 统一 board 领域模型

- [x] 将默认 board 列定义统一为 `Backlog -> Todo -> Dev -> Review -> Blocked -> Done`
- [x] 对齐 `task-workflow-service` 与 `kanban-board-service` 的列语义，避免一个有 `Blocked`、一个没有
- [x] 明确每列的 canonical id、展示名、recommended role、recommended specialist
- [x] 明确列迁移规则：允许前进、回退、阻塞、解阻塞

涉及文件：

- `apps/local-server/src/app/services/kanban-board-service.ts`
- `apps/local-server/src/app/services/task-workflow-service.ts`
- `apps/local-server/src/app/schemas/kanban.ts`

验收标准：

- [ ] 新建项目后默认 board 自动具备 6 列
- [ ] 任务状态映射到列时不会出现 `task.columnId` 合法但 board 中无对应列的情况

### 2. 提供 board projection API

- [x] 新增返回 `board + columns + cards` 的聚合接口
- [x] 每列卡片至少包含：`id`、`title`、`kind`、`status`、`priority`、`assignedRole`、`assignedSpecialistName`、`triggerSessionId`、`lastSyncError`
- [x] 支持按 `projectId` 和 `boardId` 查询
- [x] 返回列内排序信息，避免前端自行猜测
- [x] 在 presenter 层补充 HATEOAS links，至少包含 `self`、`tasks`、`move-card` 或等价 action link

涉及文件：

- `apps/local-server/src/app/routes/kanban.ts`
- `apps/local-server/src/app/presenters/kanban-presenter.ts`
- `apps/local-server/src/app/services/task-service.ts`

验收标准：

- [ ] 前端读取一个接口就能渲染完整 board
- [ ] 不需要再额外手工拼 task list 与 board columns

### 3. 做真正的 Kanban 页面

- [x] 新建项目级 Kanban 页面或在现有项目页增加 Kanban 主视图
- [x] 用列式布局展示 columns 与 cards
- [x] 卡片上展示核心状态：lane、specialist、session、错误、自动推进状态
- [x] 支持点击卡片打开 task 详情或对应 session
- [x] 支持空列、阻塞列、自动化执行中列的视觉区分
- [x] 保留现有 orchestration/status 面板，但不要让其承担 board 主视图职责

涉及文件：

- `apps/web/src/features/projects/`
- `libs/frontend/features/projects/src/lib/`

验收标准：

- [ ] 用户进入项目后，可以直接看到完整列视图
- [ ] 当前活跃卡片、阻塞卡片、已完成卡片一眼可见

### 4. 支持卡片移动

- [x] 提供卡片 move API，最少支持变更 `boardId`、`columnId`、`position`
- [x] move 时复用现有 lane transition 逻辑，确保 session archive、triggerSessionId 清理、event emit 不被绕过
- [x] 支持从 Review 回退到 Dev
- [x] 支持进入 Blocked 与从 Blocked 恢复
- [x] 为未来拖拽排序保留 `position` 规则
- [x] 支持同列内按 `position` 重排并持久化顺序

涉及文件：

- `apps/local-server/src/app/routes/tasks.ts`
- `apps/local-server/src/app/services/task-lane-service.ts`
- `apps/local-server/src/app/services/kanban-event-service.ts`

验收标准：

- [ ] 手动 move card 后，相关 session 状态与 orchestration event 正确更新
- [ ] 从 UI 手动回退 Review 卡片不会破坏自动化状态

## P1

### 5. 打通 Spec / 用户意图 -> cards sync

- [x] 明确 canonical spec 中 `@@@task` block 与 task/card 的映射规则
- [x] 提供 `spec sync` 能力：新增 block 创建卡片、更新 block 更新卡片、删除 block 标记卡片失效或归档
- [x] 保留 `sourceType=spec_note` 与 `sourceEntryIndex` 作为追踪依据
- [x] 避免“spec 有任务块但 board 上没有卡片”与“board 有卡片但 spec 已删除”的漂移
- [x] 在 UI 中提供显式 sync 入口或自动 sync 策略

涉及文件：

- `apps/local-server/src/assets/flow-templates/routa-spec-loop.md`
- `apps/local-server/src/app/services/task-service.ts`
- `libs/frontend/features/projects/src/lib/session/project-session-spec-pane.tsx`
- `docs/routa-spec-task-sync-protocol.md`

验收标准：

- [x] 更新 spec 后，可稳定生成或更新对应卡片
- [x] 用户能看到 spec block 与 board card 的一一对应关系

### 6. 补齐列角色闭环

- [x] 为 `Todo` 明确 orchestrator specialist，避免现在只靠 coordinator/crafter 隐式承担
- [x] 为 `Done` 明确 reporter specialist 或 done summarizer 职责
- [x] 为 `Blocked` 明确 blocker triage / resolver specialist
- [x] 为每列定义默认 prompt 模板，而不是只靠 `Dev` / `Review` 特判
- [x] 将 specialist 绑定写入 board column automation 或等价配置中

涉及文件：

- `apps/local-server/src/assets/specialists/`
- `apps/local-server/src/app/plugins/kanban-workflow-orchestrator.ts`
- `apps/local-server/src/app/services/kanban-board-service.ts`

验收标准：

- [x] 每一列都有明确 owner role
- [x] 自动化启动 session 时，不需要靠列名字符串猜角色

### 7. 扩展 Kanban MCP tools

- [ ] 新增 `create_card`
- [ ] 新增 `update_card`
- [ ] 新增 `move_card`
- [ ] 新增 `block_card`
- [ ] 新增 `unblock_card`
- [ ] 新增 `list_board` 或 `get_board_view`
- [ ] 保持 `request_previous_lane_handoff` / `submit_lane_handoff` 作为 lane 协作工具，而非唯一 kanban tool

涉及文件：

- `apps/local-server/src/app/mcp/tool-catalog/kanban-tools.ts`
- `apps/local-server/src/app/mcp/tool-handlers/`
- `apps/local-server/src/app/routes/mcp.test.ts`

验收标准：

- [ ] agent 可以直接围绕 card 工作
- [ ] 不需要通过底层 task patch 模拟所有看板操作

## P2

### 8. 看板配置化

- [ ] 支持创建多个 boards
- [ ] 支持列增删改排序
- [ ] 支持配置列自动化：enabled、provider、specialistId、requiredArtifacts、transitionType
- [ ] 支持配置 board-level concurrency / WIP limit
- [ ] 支持项目级默认 board 与备用 board

验收标准：

- [ ] board 不再是硬编码模板
- [ ] 不同项目可使用不同 workflow 结构

### 9. 看板观测与可解释性

- [ ] 在卡片详情展示 laneSessions 时间线
- [ ] 在卡片详情展示 laneHandoffs
- [ ] 展示 artifact gate 缺失项与通过证据
- [ ] 展示“为什么卡片停在这里”的 explain 信息
- [ ] 展示 auto-advance 决策链路

涉及文件：

- `libs/frontend/features/projects/src/lib/session/project-session-status-sidebar.tsx`
- `apps/local-server/src/app/services/task-artifact-gate-service.ts`
- `apps/local-server/src/app/services/session-context-service.ts`

验收标准：

- [ ] 用户可以从单张卡片追溯执行、评审、阻塞、回退原因

### 10. 拖拽和排序体验

- [ ] 支持列内拖拽排序
- [ ] 支持跨列拖拽
- [ ] 对自动化运行中的卡片给出拖拽限制或确认交互
- [ ] 拖拽后持久化 `position`
- [ ] 处理并发拖拽与自动推进冲突

验收标准：

- [ ] 常规看板操作不需要跳出页面
- [ ] 拖拽不会破坏后端自动化队列状态

## 测试补充

- [x] 补充 board projection route tests
- [x] 补充 move card route tests
- [x] 补充 Review -> Dev 回退测试
- [x] 补充 Blocked 进入/恢复测试
- [x] 补充列内排序持久化测试
- [ ] 补充 spec sync 测试
- [ ] 补充 kanban MCP tool tests
- [x] 补充前端 Kanban 页面交互测试

## 建议执行顺序

1. 统一 board 领域模型
2. 提供 board projection API
3. 做 Kanban 页面
4. 支持 move card
5. 打通 spec sync
6. 补齐列角色闭环
7. 扩展 kanban MCP tools
8. 做配置化、观测、拖拽增强

## 里程碑定义

### M1

- [x] 可以看
- [x] 可以移动
- [x] 可以打开 session

### M2

- [ ] 可以从 spec 自动产卡
- [ ] 可以自动流转到 Dev / Review / Done / Blocked
- [ ] 可以解释卡片为何停留在当前列

### M3

- [ ] agent 可以通过 MCP 直接管理 card
- [ ] board 可以按项目定制
- [ ] 前端体验达到日常主工作台级别
