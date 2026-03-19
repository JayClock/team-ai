# Routa 看板开发任务列表

## 使用方式

- `M1` 先做“看得见、能移动、能追踪”
- `M2` 再做“能从 spec 产卡并自动流转”
- `M3` 最后做“可配置、可扩展、可被 agent 直接操作”

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

- [ ] 新增 `create_card`
- [ ] 新增 `update_card`
- [ ] 新增 `move_card`
- [ ] 新增 `block_card`
- [ ] 新增 `unblock_card`
- [ ] 新增 `get_board_view`
- [ ] 为每个 tool 定义 args schema、返回 payload、错误码

涉及文件：

- `apps/local-server/src/app/mcp/tool-catalog/kanban-tools.ts`
- `apps/local-server/src/app/mcp/tool-handlers/`

完成标准：

- [ ] agent 可以直接围绕 card 工作

### RK-M3-02 实现 card 级 MCP handlers

类型：后端/MCP

前置依赖：`RK-M3-01`

开发任务：

- [ ] create card handler
- [ ] update card handler
- [ ] move card handler
- [ ] block/unblock handler
- [ ] board view handler
- [ ] 复用现有 task service / move card API，不重复实现规则

完成标准：

- [ ] MCP 操作与 REST 操作行为一致

### RK-M3-03 支持 board 配置管理 API

类型：后端

前置依赖：M1 完成

开发任务：

- [ ] 新增 create board API
- [ ] 新增 update board API
- [ ] 新增 create/update/delete column API
- [ ] 支持调整列顺序
- [ ] 支持设置列自动化配置
- [ ] 支持 project default board

涉及文件：

- `apps/local-server/src/app/routes/kanban.ts`
- `apps/local-server/src/app/services/kanban-board-service.ts`

完成标准：

- [ ] board 不再是硬编码单模板

### RK-M3-04 新建 board 设置页面

类型：前端

前置依赖：`RK-M3-03`

开发任务：

- [ ] 增加 board 设置入口
- [ ] 支持列增删改排序
- [ ] 支持配置 specialist / provider
- [ ] 支持配置 requiredArtifacts
- [ ] 支持配置 autoAdvanceOnSuccess / transitionType

涉及文件：

- `apps/web/src/features/projects/`
- `libs/frontend/features/projects/src/lib/`

完成标准：

- [ ] 用户可以可视化管理 board 配置

### RK-M3-05 实现拖拽交互

类型：前端

前置依赖：`RK-M1-10`, `RK-M1-07`

开发任务：

- [ ] 列内拖拽排序
- [ ] 跨列拖拽
- [ ] 乐观更新或局部刷新策略
- [ ] 对运行中卡片增加限制或确认
- [ ] 处理拖拽失败回滚

完成标准：

- [ ] 看板具备主工作台操作效率

### RK-M3-06 增强卡片 observability

类型：前端/后端

前置依赖：M2 完成

开发任务：

- [ ] 卡片详情显示 lane session 时间线
- [ ] 显示 handoff 往返链路
- [ ] 显示 artifact evidence 列表
- [ ] 显示自动推进决策记录
- [ ] 显示最近一次 specialist 输出摘要

涉及文件：

- `apps/local-server/src/app/services/session-context-service.ts`
- `libs/frontend/features/projects/src/lib/session/`

完成标准：

- [ ] 卡片成为可审计工作单元

### RK-M3-07 M3 测试补齐

类型：测试

前置依赖：M3 主要开发任务

开发任务：

- [ ] 补 MCP kanban tools tests
- [ ] 补 board config route tests
- [ ] 补前端拖拽 tests
- [ ] 补 board settings tests
- [ ] 补 observability 渲染 tests

完成标准：

- [ ] M3 新能力都有回归保障

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

- [ ] 整理 M1/M2/M3 对应验证命令
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

- [ ] RK-M3-01
- [ ] RK-M3-02
- [ ] RK-M3-03
- [ ] RK-M3-04
- [ ] RK-M3-05
- [ ] RK-M3-06

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
