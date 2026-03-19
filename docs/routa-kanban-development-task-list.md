# Routa 看板开发任务列表

## 使用方式

- `M1` 先做“看得见、能移动、能追踪”
- `M2` 再做“能从 spec 产卡并自动流转”
- `M3` 再做“可配置、可扩展、可被 agent 直接操作”
- `M4` 最后补“自然语言入口、实时协作、board policy 与外部触发闭环”

任务状态建议：

- `todo`
- `in_progress`
- `blocked`
- `done`

---

## M1

目标：

- 有真正的看板页面
- 有完整列模型
- 有 board projection API
- 有 move card 能力
- 能从卡片打开 task/session

当前状态：`done`

### [x] RK-M1-01 统一默认 board 列模型

类型：后端

前置依赖：无

开发任务：

- [ ] 将默认 board 列改为 `Backlog / Todo / Dev / Review / Blocked / Done`
- [ ] 给每列定义稳定 id，不依赖展示名推导
- [ ] 将 `kanban-board-service` 默认列与 `task-workflow-service` 保持一致
- [ ] 统一列 position 定义
- [ ] 明确 Review 回退、Blocked 进入/恢复的列关系

涉及文件：

- `apps/local-server/src/app/services/kanban-board-service.ts`
- `apps/local-server/src/app/services/task-workflow-service.ts`
- `apps/local-server/src/app/schemas/kanban.ts`

完成标准：

- [ ] 新建 board 自动具备 6 列
- [ ] 旧逻辑不再出现 `columnId` 与 board 列不一致

### [x] RK-M1-02 清理按列名猜角色的逻辑

类型：后端

前置依赖：`RK-M1-01`

开发任务：

- [ ] 将 `deriveStatusForColumn` 的列判断从名称匹配改成 canonical stage 或 id
- [ ] 将 `deriveRoleForColumn` 改成基于列配置或 canonical stage
- [ ] 将 `requiresTaskWorktree` 改成配置驱动，不靠字符串包含 `dev`
- [ ] 为迁移提供兼容处理，防止历史 board 数据失效

涉及文件：

- `apps/local-server/src/app/services/kanban-workflow-orchestrator-service.ts`

完成标准：

- [ ] 列重命名后自动化仍然可工作
- [ ] orchestrator 不再依赖 `includes('review')` 这类脆弱规则

### [x] RK-M1-03 新增 board projection schema

类型：后端

前置依赖：`RK-M1-01`

开发任务：

- [ ] 新增 board projection payload
- [ ] 定义 card summary payload
- [ ] 在列 payload 中嵌入 cards 数组
- [ ] 在 card summary 中补足看板渲染所需字段
- [ ] 预留排序字段和可操作 link/action 字段

建议新增结构：

- `KanbanBoardProjectionPayload`
- `KanbanColumnProjectionPayload`
- `KanbanCardSummaryPayload`

涉及文件：

- `apps/local-server/src/app/schemas/kanban.ts`

完成标准：

- [ ] 前端无需再拼 board 与 tasks

### [x] RK-M1-04 实现 board projection service

类型：后端

前置依赖：`RK-M1-03`

开发任务：

- [ ] 新增 board projection service
- [ ] 按 boardId 拉取 columns
- [ ] 按 boardId 拉取 tasks
- [ ] 按 columnId 聚合 cards
- [ ] 按 `position`、`updatedAt` 等规则排序
- [ ] 将 triggerSession、lastSyncError、assignedSpecialistName 等信息映射进 card summary

涉及文件：

- `apps/local-server/src/app/services/kanban-board-service.ts`
- 可新增 `apps/local-server/src/app/services/kanban-board-projection-service.ts`

完成标准：

- [ ] 一个 service 就能输出前端所需完整 board state

### [x] RK-M1-05 暴露 board projection route

类型：后端

前置依赖：`RK-M1-04`

开发任务：

- [ ] 在 `GET /projects/:projectId/kanban/boards/:boardId` 上返回 projection，或新增单独 projection endpoint
- [ ] 给 board / column / card 增加 HATEOAS links
- [ ] 对 projectId / boardId 做归属校验
- [ ] 保持 vendor media type 一致

涉及文件：

- `apps/local-server/src/app/routes/kanban.ts`
- `apps/local-server/src/app/presenters/kanban-presenter.ts`

完成标准：

- [ ] 前端请求一个 endpoint 即可渲染看板

### [x] RK-M1-06 增加 move card API

类型：后端

前置依赖：`RK-M1-01`

开发任务：

- [ ] 定义 `move card` 请求体
- [ ] 支持更新 `boardId`、`columnId`、`position`
- [ ] move 时调用现有 `prepareTaskForColumnTransition`
- [ ] move 时正确处理 `sessionIds`、`triggerSessionId`、`lastSyncError`
- [ ] move 后发出 `task.column-transition` event
- [ ] 支持 Review -> Dev 回退
- [ ] 支持进入 Blocked 与从 Blocked 恢复

涉及文件：

- `apps/local-server/src/app/routes/tasks.ts`
- `apps/local-server/src/app/services/task-lane-service.ts`

完成标准：

- [ ] 手动移卡不破坏 session 状态
- [ ] 自动化仍能继续工作

### [x] RK-M1-07 增加列内排序持久化

类型：后端

前置依赖：`RK-M1-06`

开发任务：

- [x] 统一 task `position` 语义
- [x] 设计列内 position 重排逻辑
- [x] move 到新列时自动分配 position
- [x] 保证 position 可重复修复或重建

涉及文件：

- `apps/local-server/src/app/services/task-service.ts`
- `apps/local-server/src/app/routes/tasks.ts`

完成标准：

- [x] 同一列内卡片顺序稳定

### [x] RK-M1-08 新建项目 Kanban 页面

类型：前端

前置依赖：`RK-M1-05`

开发任务：

- [ ] 新增项目级 Kanban 路由页
- [ ] 请求 board projection 数据
- [ ] 渲染 6 列布局
- [ ] 每列显示列名、卡片数、自动化状态
- [ ] 每张卡片显示标题、kind、role、specialist、session、error
- [ ] 支持 loading / empty / error 状态

涉及文件：

- `apps/web/src/features/projects/`
- `libs/frontend/features/projects/src/lib/`

完成标准：

- [ ] 进入项目能直接看到真正的列式看板

### [x] RK-M1-09 实现卡片详情侧栏或弹窗

类型：前端

前置依赖：`RK-M1-08`

开发任务：

- [ ] 点击卡片打开详情
- [ ] 展示 task 基础字段
- [ ] 展示 laneSessions 摘要
- [ ] 展示最新 handoff 摘要
- [ ] 提供“打开 session”“打开任务详情”操作

涉及文件：

- `libs/frontend/features/projects/src/lib/`

完成标准：

- [ ] 用户不离开看板也能理解卡片状态

### [x] RK-M1-10 实现手动移动卡片交互

类型：前端

前置依赖：`RK-M1-06`, `RK-M1-08`

开发任务：

- [ ] 先实现非拖拽版 move：卡片菜单选择目标列
- [ ] 调用 move card API
- [ ] 成功后刷新 board projection
- [ ] 对自动化运行中的卡片增加确认提示
- [ ] 对失败场景显示错误 toast

涉及文件：

- `libs/frontend/features/projects/src/lib/`

完成标准：

- [ ] 用户可手动回退、阻塞、恢复卡片

### [x] RK-M1-11 将现有 workflow 摘要卡与新看板关系梳理清楚

类型：前端

前置依赖：`RK-M1-08`

开发任务：

- [x] 保留 `Workflow Board` 摘要卡但降级为 overview
- [x] 让 overview 链接到新 Kanban 页面
- [x] 避免两个地方重复承担主看板职责

涉及文件：

- `libs/frontend/features/projects/src/lib/session/project-session-status-sidebar.tsx`

完成标准：

- [x] 用户不会混淆“摘要”和“真正看板”

### [x] RK-M1-12 M1 测试补齐

类型：测试

前置依赖：M1 主要开发任务

开发任务：

- [x] 补 route test: board projection
- [x] 补 route test: move card
- [x] 补 route test: Review -> Dev
- [x] 补 route test: Blocked 进入/恢复
- [x] 补前端 page test: Kanban 渲染
- [x] 补前端交互 test: move card

涉及文件：

- `apps/local-server/src/app/routes/*.test.ts`
- `libs/frontend/features/projects/**/*.spec.tsx`

完成标准：

- [x] M1 关键路径都有自动化测试

---

## M2

目标：

- Spec / 用户意图稳定产卡
- 卡片自动进入 Dev / Review / Done / Blocked
- 每列有清晰 specialist 分工
- 用户能看懂“为什么卡住”

### RK-M2-01 明确 spec block 到 card 的映射协议

类型：后端/产品规则

前置依赖：无

开发任务：

- [x] 定义 `@@@task` block 唯一标识策略
- [x] 定义 block 更新如何映射到已有 task
- [x] 定义 block 删除如何处理旧 task
- [x] 定义 spec 中哪些字段映射到 task：title、objective、acceptanceCriteria、verification、owner、dependsOn
- [x] 输出 mapping 文档

涉及文件：

- `apps/local-server/src/assets/flow-templates/routa-spec-loop.md`
- 可新增 `docs/` 设计文档
- `docs/routa-spec-task-sync-protocol.md`

完成标准：

- [x] spec sync 行为不再靠隐式约定

### RK-M2-02 实现 spec sync service

类型：后端

前置依赖：`RK-M2-01`

开发任务：

- [x] 读取 canonical spec note
- [x] 解析 `@@@task` blocks
- [x] 与现有 tasks 做 diff
- [x] 新 block 创建 task/card
- [x] 已有 block 更新 task/card
- [x] 删除 block 时归档或标记任务失效
- [x] 回写 source linkage 信息

涉及文件：

- 可新增 `apps/local-server/src/app/services/spec-task-sync-service.ts`
- `apps/local-server/src/app/services/task-service.ts`

完成标准：

- [x] spec 与 cards 保持同步

### RK-M2-03 提供 spec sync 触发入口

类型：后端/前端

前置依赖：`RK-M2-02`

开发任务：

- [x] 增加手动 sync API
- [x] 在 spec pane 提供“同步到看板”按钮
- [x] 明确是否在 note 更新后自动触发 sync
- [x] 对 sync 结果返回新增、更新、归档统计

涉及文件：

- `apps/local-server/src/app/routes/`
- `libs/frontend/features/projects/src/lib/session/project-session-spec-pane.tsx`

完成标准：

- [x] 用户可以显式触发 spec -> card 同步

### RK-M2-04 补齐 Todo / Done / Blocked specialist

类型：后端配置

前置依赖：无

开发任务：

- [x] 新增 Todo orchestrator specialist
- [x] 新增 Done reporter specialist
- [x] 新增 Blocked resolver specialist
- [x] 为每个 specialist 写清职责、边界、输出格式
- [x] 将默认列与 specialist 建立显式映射

涉及文件：

- `apps/local-server/src/assets/specialists/`
- `apps/local-server/src/app/services/kanban-board-service.ts`

完成标准：

- [x] 每一列都有明确 owner specialist

### RK-M2-05 改造列自动化为配置驱动

类型：后端

前置依赖：`RK-M2-04`

开发任务：

- [x] 在 column automation 中显式存 provider / specialistId / role / requiredArtifacts
- [x] session 启动时优先读取列配置
- [x] 删除对列名的角色推断逻辑
- [x] Done 列支持自动 completion summary
- [x] Blocked 列支持 blocker triage 流转

涉及文件：

- `apps/local-server/src/app/plugins/kanban-workflow-orchestrator.ts`
- `apps/local-server/src/app/services/kanban-workflow-orchestrator-service.ts`

完成标准：

- [x] 自动化行为由列配置决定

### RK-M2-06 打通卡片自动流转主链路

类型：后端

前置依赖：`RK-M2-05`

开发任务：

- [x] Todo 进入可执行状态后自动推进到 Dev
- [x] Dev 成功后进入 Review
- [x] Review 通过后进入 Done
- [x] Review 不通过时回退 Dev 或进入 Blocked
- [x] 缺少 artifact 时进入 Blocked 或停留并给出明确说明

涉及文件：

- `apps/local-server/src/app/services/kanban-workflow-orchestrator-service.ts`
- `apps/local-server/src/app/services/task-artifact-gate-service.ts`

完成标准：

- [x] 主链路行为可预测且可解释

### RK-M2-07 在卡片详情中展示 explain 信息

类型：前端/后端

前置依赖：`RK-M2-06`

开发任务：

- [x] 输出 card explain payload
- [x] 展示当前列原因
- [x] 展示最新自动化结果
- [x] 展示 artifact gate 缺失项
- [x] 展示最近一次回退或阻塞原因

涉及文件：

- `apps/local-server/src/app/services/task-artifact-gate-service.ts`
- `libs/frontend/features/projects/src/lib/`

完成标准：

- [x] 用户能回答“为什么这张卡在这里”

### RK-M2-08 M2 测试补齐

类型：测试

前置依赖：M2 主要开发任务

开发任务：

- [x] 补 spec sync 测试
- [x] 补 Todo -> Dev -> Review -> Done 测试
- [x] 补 Review fail -> Dev 回退测试
- [x] 补 artifact gate 阻塞测试
- [x] 补 specialist 配置驱动测试

完成标准：

- [x] spec-first 主流程具备回归测试

---

## M3

目标：

- 看板可配置
- agent 可直接操作 card
- 看板具备主工作台级体验

### RK-M3-01 扩展 Kanban MCP tool catalog

类型：后端/MCP

前置依赖：M1 完成

开发任务：

- [x] 新增 `create_card`
- [x] 新增 `update_card`
- [x] 新增 `move_card`
- [x] 新增 `block_card`
- [x] 新增 `unblock_card`
- [x] 新增 `get_board_view`
- [x] 为每个 tool 定义 args schema、返回 payload、错误码

涉及文件：

- `apps/local-server/src/app/mcp/tool-catalog/kanban-tools.ts`
- `apps/local-server/src/app/mcp/tool-handlers/`

完成标准：

- [x] agent 可以直接围绕 card 工作

### RK-M3-02 实现 card 级 MCP handlers

类型：后端/MCP

前置依赖：`RK-M3-01`

开发任务：

- [x] create card handler
- [x] update card handler
- [x] move card handler
- [x] block/unblock handler
- [x] board view handler
- [x] 复用现有 task service / move card API，不重复实现规则

完成标准：

- [x] MCP 操作与 REST 操作行为一致

### RK-M3-03 支持 board 配置管理 API

类型：后端

前置依赖：M1 完成

开发任务：

- [x] 新增 create board API
- [x] 新增 update board API
- [x] 新增 create/update/delete column API
- [x] 支持调整列顺序
- [x] 支持设置列自动化配置
- [x] 支持 project default board

涉及文件：

- `apps/local-server/src/app/routes/kanban.ts`
- `apps/local-server/src/app/services/kanban-board-service.ts`

完成标准：

- [x] board 不再是硬编码单模板

### RK-M3-04 新建 board 设置页面

类型：前端

前置依赖：`RK-M3-03`

开发任务：

- [x] 增加 board 设置入口
- [x] 支持列增删改排序
- [x] 支持配置 specialist / provider
- [x] 支持配置 requiredArtifacts
- [x] 支持配置 autoAdvanceOnSuccess / transitionType

涉及文件：

- `apps/web/src/features/projects/`
- `libs/frontend/features/projects/src/lib/`

完成标准：

- [x] 用户可以可视化管理 board 配置

### RK-M3-05 实现拖拽交互

类型：前端

前置依赖：`RK-M1-10`, `RK-M1-07`

开发任务：

- [x] 列内拖拽排序
- [x] 跨列拖拽
- [x] 乐观更新或局部刷新策略
- [x] 对运行中卡片增加限制或确认
- [x] 处理拖拽失败回滚

完成标准：

- [x] 看板具备主工作台操作效率

### RK-M3-06 增强卡片 observability

类型：前端/后端

前置依赖：M2 完成

开发任务：

- [x] 卡片详情显示 lane session 时间线
- [x] 显示 handoff 往返链路
- [x] 显示 artifact evidence 列表
- [x] 显示自动推进决策记录
- [x] 显示最近一次 specialist 输出摘要

涉及文件：

- `apps/local-server/src/app/services/session-context-service.ts`
- `libs/frontend/features/projects/src/lib/session/`

完成标准：

- [x] 卡片成为可审计工作单元

### RK-M3-07 M3 测试补齐

类型：测试

前置依赖：M3 主要开发任务

开发任务：

- [x] 补 MCP kanban tools tests
- [x] 补 board config route tests
- [x] 补前端拖拽 tests
- [x] 补 board settings tests
- [x] 补 observability 渲染 tests

完成标准：

- [x] M3 新能力都有回归保障

---

## M4

目标：

- 用户一句话就能产出 backlog/spec/cards
- specialist 可以通过 UI / API 真正管理
- 看板具备实时协作感，而不是手动刷新
- WIP / board policy 变成真实约束，不只是配置项
- webhook / schedule / memory / traces 与 Kanban 主视角打通

当前状态：`in_progress`

### RK-M4-01 实现 prompt -> backlog/spec/cards 入口

类型：后端/前端

前置依赖：`RK-M2-02`, `RK-M3-03`

开发任务：

- [x] 新增 project 级“创建任务目标”入口，接收自然语言 intent
- [x] 为 coordinator 定义 intake payload：goal、constraints、acceptance hints、artifacts hints
- [x] 将 intake 请求落成 canonical spec note 或等价 planning document
- [x] 复用 spec sync，把分解结果直接物化成 backlog / todo cards
- [x] 返回本次 intake 生成的 spec 片段、card ids、分解摘要
- [x] 在 UI 中提供从项目页直接进入 intake 的入口，而不是只从 spec pane 手动同步

涉及文件：

- `apps/local-server/src/app/routes/`
- `apps/local-server/src/app/services/`
- `libs/frontend/features/projects/src/lib/session/`
- `apps/web/src/features/projects/`

完成标准：

- [x] 用户一句话可以直接生成一组 Kanban cards
- [x] 不要求用户先手写 spec 才能上板

### RK-M4-02 补 coordinator 的分解与回写闭环

类型：后端/编排

前置依赖：`RK-M4-01`

开发任务：

- [x] 为 coordinator 定义“只拆解、不写代码”的明确行为边界
- [x] intake 后自动生成 refinement notes、acceptance criteria、execution hints
- [x] 支持将 review / blocked / done 的结果回写到 spec 或 planning note
- [x] 在 cards 与 spec block 之间保留稳定 linkage，支持再次 refine
- [x] 为多 wave 分解保留版本或 revision 信息

涉及文件：

- `apps/local-server/src/assets/specialists/routa-coordinator.md`
- `apps/local-server/src/app/services/spec-task-sync-service.ts`
- `apps/local-server/src/app/services/kanban-workflow-orchestrator-service.ts`

完成标准：

- [x] coordinator 成为真正的 planning 层，而不是隐式入口
- [x] spec 与 cards 可以双向追踪和迭代

### RK-M4-03 支持 specialist CRUD 与可视化绑定

类型：后端/前端

前置依赖：`RK-M3-03`

开发任务：

- [x] 增加 specialist create / update / delete API
- [x] 支持从项目级设置页创建自定义 specialist，至少包含 id、name、role、system prompt、provider defaults
- [x] 支持从 Markdown / JSON 导入 specialist，并在 UI 中展示来源和覆盖关系
- [x] 在 board settings 中用可选列表绑定 specialist，而不是手输 `specialistId`
- [x] 对被列引用的 specialist 增加删除保护或替换流程

涉及文件：

- `apps/local-server/src/app/routes/specialists.ts`
- `apps/local-server/src/app/services/specialist-service.ts`
- `libs/frontend/features/projects/src/lib/components/project-settings-dialog.tsx`
- `apps/web/src/features/projects/project-kanban-settings-page.tsx`

完成标准：

- [x] specialist 可通过 UI / API 管理
- [x] column 绑定 specialist 时不再依赖人工记忆 id

### RK-M4-04 为 Kanban 页增加实时事件流

类型：后端/前端

前置依赖：`RK-M3-05`, `RK-M3-06`

状态：`done`

开发任务：

- [x] 设计 board-level event stream schema，覆盖 card move / session start / session end / background completion
- [x] 提供 project / board 级 SSE 订阅端点
- [x] 前端 Kanban 页接入事件流，并在收到事件后自动刷新 board projection
- [x] 对运行中的卡片展示实时执行状态与最近一次事件摘要
- [x] 在网络断开、切项目、切 board 时正确重连与清理

涉及文件：

- `apps/local-server/src/app/routes/`
- `apps/local-server/src/app/services/`
- `libs/frontend/shared/util-http/src/lib/standard-sse-chat-transport.ts`
- `apps/web/src/features/projects/project-kanban-page.tsx`

完成标准：

- [x] 看板不依赖手动 refresh 才能反映自动化进度
- [x] 用户能实时看到“谁在处理、处理到哪一步、为什么回退”

### RK-M4-05 落实 WIP / board policy enforcement

类型：后端/前端

前置依赖：`RK-M3-03`, `RK-M4-04`

状态：`done`

开发任务：

- [x] 将 `wipLimit` 纳入 move card 校验
- [x] 将 `wipLimit` 纳入自动推进与队列调度校验
- [x] 支持列级 entry policy，例如 required artifacts、allowed source columns、manual approval required
- [x] 前端在拖拽和菜单移动前展示 policy violation 原因
- [x] 为 bypass 或管理员强制移动预留明确接口与审计记录

涉及文件：

- `apps/local-server/src/app/services/kanban-card-service.ts`
- `apps/local-server/src/app/services/kanban-session-queue-service.ts`
- `apps/local-server/src/app/services/kanban-board-service.ts`
- `apps/web/src/features/projects/project-kanban-page.tsx`

完成标准：

- [x] board policy 会真实阻止非法推进，而不是仅作为展示信息
- [x] 自动化与手工操作遵守同一套规则

### RK-M4-06 打通 webhook / schedule -> Kanban

类型：后端/集成

前置依赖：`RK-M4-01`

状态：`done`

开发任务：

- [x] 定义 GitHub webhook 到 card 生命周期的映射规则
- [x] 支持 issue / PR / push 事件创建或更新 backlog / review cards
- [x] 为 blocked cards 增加定时 triage / reminder trigger
- [x] 为 backlog hygiene 增加 schedule-based refinement trigger
- [x] 在 card 上保留 trigger source 与外部引用信息

涉及文件：

- `apps/local-server/src/app/routes/`
- `apps/local-server/src/app/services/flow-runtime-service.ts`
- `apps/local-server/src/app/services/`
- `libs/frontend/shared/schema/src/lib/flow.ts`

完成标准：

- [x] 外部事件可以稳定进入 Kanban，而不是停留在 workflow 子系统
- [x] 用户可以区分 manual / schedule / webhook 触发来源

### RK-M4-07 增加 card memory 与 trace drill-down

类型：后端/前端

前置依赖：`RK-M3-06`

开发任务：

- [x] 为 card 定义长期 memory 结构：decisions、blockers、resolved notes、done summaries
- [x] 将 memory 与 laneSessions / laneHandoffs / traces 建立关联
- [x] 在卡片详情中增加 trace timeline / trace jump links
- [x] 支持从 review / done / blocked specialist 输出中自动提炼 memory 条目
- [x] 支持下一轮 refinement 读取 card memory 作为上下文

涉及文件：

- `apps/local-server/src/app/services/session-context-service.ts`
- `apps/local-server/src/app/services/trace-service.ts`
- `apps/local-server/src/app/routes/traces.ts`
- `apps/web/src/features/projects/project-kanban-page.tsx`

完成标准：

- [x] card 成为可持续演化的工作单元，而不是一次性状态节点
- [x] 用户可以从 card 直接钻取关键 trace 和决策历史

### RK-M4-08 M4 测试与文档补齐

类型：测试/文档

前置依赖：M4 主要开发任务

开发任务：

- [ ] 补 intake -> spec -> cards 的端到端测试
- [ ] 补 specialist CRUD route / UI tests
- [ ] 补 board realtime subscription tests
- [ ] 补 WIP / policy enforcement tests
- [ ] 补 webhook / schedule 映射测试
- [ ] 补 card memory / trace drill-down tests
- [ ] 更新开发流程文档与验收说明

完成标准：

- [ ] M4 新能力具备回归保障
- [ ] 新协作模式有清晰操作文档

---

## 横向任务

### RK-X-01 数据迁移评估

类型：后端/数据

开发任务：

- [ ] 评估现有 SQLite 数据是否需要补 `Blocked` 列
- [ ] 评估历史 task `columnId` 兼容策略
- [ ] 评估旧 board 是否自动补列
- [ ] 给出一次性迁移还是惰性修复方案

### RK-X-02 文档更新

类型：文档

开发任务：

- [ ] 更新 AGENTS/项目说明中的看板行为描述
- [ ] 更新开发流程文档
- [ ] 更新测试与验证说明

### RK-X-03 验证命令清单

类型：工程

开发任务：

- [ ] 整理 M1/M2/M3/M4 对应验证命令
- [ ] 输出推荐的 `nx` 测试命令组合
- [ ] 为主要路径准备 smoke test 步骤

---

## 建议分批开发

### 批次 A

- [x] RK-M1-01
- [x] RK-M1-02
- [x] RK-M1-03
- [x] RK-M1-04
- [x] RK-M1-05

### 批次 B

- [x] RK-M1-06
- [x] RK-M1-07
- [x] RK-M1-08
- [x] RK-M1-09
- [x] RK-M1-10
- [x] RK-M1-11
- [x] RK-M1-12

### 批次 C

- [x] RK-M2-01
- [x] RK-M2-02
- [x] RK-M2-03
- [x] RK-M2-04
- [x] RK-M2-05
- [x] RK-M2-06
- [x] RK-M2-07

### 批次 D

- [x] RK-M3-01
- [x] RK-M3-02
- [x] RK-M3-03
- [x] RK-M3-04
- [x] RK-M3-05
- [x] RK-M3-06

### 批次 E

- [x] RK-M4-01
- [x] RK-M4-02
- [x] RK-M4-03

### 批次 F

- [x] RK-M4-04
- [x] RK-M4-05
- [x] RK-M4-06
- [x] RK-M4-07
- [ ] RK-M4-08

---

## 首批建议直接开工项

建议先开这 6 个：

- [x] RK-M1-01 统一默认 board 列模型
- [x] RK-M1-02 清理按列名猜角色的逻辑
- [x] RK-M1-03 新增 board projection schema
- [x] RK-M1-04 实现 board projection service
- [x] RK-M1-05 暴露 board projection route
- [x] RK-M1-08 新建项目 Kanban 页面

原因：

- 这是最短路径，能先把“真实看板”做出来
- 先把读模型和 UI 建起来，再做 move/sync/automation 风险更低
