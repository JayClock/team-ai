# Routa Kanban 数据迁移评估

## 结论

当前看板体系不需要单独做一次性 SQL 迁移，现有实现已经具备惰性修复能力，推荐继续采用 lazy reconciliation。

## 评估结果

### 1. 默认 board 是否需要补 `Blocked` 列

结论：不需要单独补库脚本。

原因：

- 新建默认 board 时会直接创建 `Backlog / Todo / Dev / Review / Blocked / Done` 六列。
- 读取历史 workflow board 时，会在 reconcile 阶段自动补齐缺失列，并统一列名、position、stage 和 automation metadata。

相关实现：

- [kanban-board-service.ts](/Users/zhongjie/Documents/GitHub/team-ai/apps/local-server/src/app/services/kanban-board-service.ts)
- [task-workflow-service.ts](/Users/zhongjie/Documents/GitHub/team-ai/apps/local-server/src/app/services/task-workflow-service.ts)

### 2. 历史 task `columnId` 兼容策略

结论：已有兼容层，可继续保留。

当前兼容方式：

- canonical workflow column 使用稳定 stage/id：`backlog`、`todo`、`dev`、`review`、`blocked`、`done`
- 历史 default board 列 id 采用 `boardId_suffix` 形式时，stage 解析逻辑会通过 `endsWith(_suffix)` 识别
- 如果任务缺少 workflow column 信息，会根据 `kind + status` 回退到 canonical workflow context

这意味着：

- 历史 `workflow-default_dev`、`brd_xxx_blocked` 这类 id 仍可映射回正确 stage
- null 或缺失 `columnId` 的任务仍可通过 workflow context 回到合理默认列

### 3. 旧 board 是否自动补列

结论：仅 workflow-managed board 自动补列，custom board 保持用户定义。

策略说明：

- managed template 为 `workflow` 的 board 在读取时自动 reconcile
- managed template 为 `custom` 的 board 不会被系统强制改结构

这样可以避免：

- 覆盖用户自定义 workflow
- 把默认工作流语义误写入自定义 board

### 4. 一次性迁移还是惰性修复

结论：继续使用惰性修复。

原因：

- 现有兼容逻辑已经在 create/read path 生效
- 不需要引入额外迁移步骤、版本门槛或离线修复窗口
- 对本地 SQLite 项目更稳妥，避免在用户未打开项目时提前改写 board 结构

## 建议

- 继续保留 `workflow` board 的 reconcile-on-read 机制
- 如果后续要做强一致列约束，再考虑增加显式 migration command
- custom board 仍应保持非破坏性，不自动补列
