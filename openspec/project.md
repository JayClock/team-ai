# Project Context

## Purpose

Team AI 是一个使用 **Smart Domain (智能领域模型)** 实现 **领域驱动设计 (DDD)** 和 **HATEOAS** 的代码样例项目。本项目展示了如何通过高内聚的领域模型直接驱动业务逻辑和 RESTful HATEOAS 接口，解决传统架构中的性能瓶颈与逻辑分散问题。

核心目标：

- 展示 Smart Domain 模式如何解决 DDD 实现中的性能与模型纯洁性冲突
- 实现符合 Richardson 成熟度模型第 3 级的 HATEOAS RESTful API
- 提供可扩展的、类型安全的 API 设计模式
- 演示关联对象 (Association Object) 模式在解决 N+1 问题中的应用

## Tech Stack

### 后端技术栈

- **Java 17+** - 主要编程语言
- **Spring Boot 3.4.8** - 应用框架
- **Spring HATEOAS** - RESTful API 超媒体支持
- **Spring Security + OAuth2** - 安全认证
- **MyBatis** - 数据持久化框架
- **PostgreSQL** - 主数据库
- **Flyway** - 数据库迁移管理
- **Spring AI + DeepSeek** - AI 集成

### 前端技术栈

- **TypeScript** - 类型安全的 JavaScript
- **React 19** - UI 框架
- **Next.js 16** - 全栈 React 框架
- **Vite** - 构建工具
- **Tailwind CSS** - CSS 框架
- **Ant Design** - UI 组件库
- **React Query** - 数据获取和状态管理

### 开发工具链

- **Nx** - 单体仓库管理
- **Jest** - 单元测试框架
- **Vitest** - 快速测试框架
- **Playwright** - E2E 测试
- **ESLint + Prettier** - 代码质量和格式化
- **Gradle** - Java 构建工具

## Project Conventions

### Code Style

#### Java 代码规范

- 使用 **Smart Domain** 模式：领域模型包含业务逻辑，避免贫血模型
- **关联对象模式**：一对多关系显式建模为 Association Object，而非简单集合
- **宽窄接口分离**：领域实体通过窄接口暴露只读操作，通过领域行为暴露状态修改
- **意图揭示接口**：方法名直接表达业务意图，而非技术实现

#### TypeScript/React 代码规范

- 严格的 TypeScript 配置，启用所有严格检查
- 函数组件优先，使用 Hooks 模式
- 类型安全的 props 和状态管理
- 使用 Preact Signals 进行响应式状态管理

#### 命名约定

- Java：使用领域驱动的命名，如 `User.Conversations`、`Conversation.Messages`
- TypeScript：使用 PascalCase 组件名，camelCase 变量名
- API：使用 RESTful 资源命名，如 `/users/{id}/conversations`

### Architecture Patterns

#### Smart Domain DDD 模式

- **关联对象 (Association Object)**：解决性能与模型纯洁性冲突
- **集体逻辑封装**：在关联对象中实现群体业务逻辑
- **意图揭示接口**：通过语义化方法名表达业务意图
- **零拷贝 Wrapper 模式**：避免 DTO 数据拷贝，使用视图适配器

#### HATEOAS 设计模式

- **同构映射**：领域模型与 REST 资源的自然对应
- **渐进式披露**：通过超媒体链接实现状态驱动的 API 交互
- **结构即导航**：基于领域结构自动生成 API 链接

#### 前端架构模式

- **类型安全优先**：确保编译时错误检查
- **声明式导航**：通过语义化关系导航资源
- **事件驱动**：响应式状态管理

### Testing Strategy

#### 后端测试策略

- **单元测试**：使用 JUnit 5 测试领域模型逻辑
- **集成测试**：使用 @SpringBootTest 测试 API 层
- **测试数据库**：使用 H2 内存数据库进行快速测试
- **测试覆盖率**：确保核心业务逻辑的测试覆盖

#### 前端测试策略

- **单元测试**：使用 Jest + React Testing Library 测试组件
- **集成测试**：使用 Vitest 测试业务逻辑
- **E2E 测试**：使用 Playwright 测试完整用户流程
- **测试驱动开发**：先写测试，再实现功能

### Git Workflow

- **主分支**：`main` - 生产就绪代码
- **开发分支**：`develop` - 集成最新功能
- **功能分支**：`feature/功能名称` - 开发新功能
- **修复分支**：`fix/问题描述` - 修复 bug
- **提交规范**：使用语义化提交信息（feat, fix, docs, style, refactor, test）

## Domain Context

### 核心领域模型

- **User (用户)**：聚合根，系统的入口与身份标识
- **Account (账户)**：用户的配置与账户信息（如 API Key 管理）
- **Conversation (对话)**：用户发起的对话上下文，作为业务逻辑载体
- **Message (消息)**：对话中的具体交互记录

### 业务场景

- 用户管理多个 AI 对话会话
- 用户配置不同的 AI 模型和参数
- 对话历史的持久化和检索
- Token 使用量统计和管理

### 领域规则

- 用户可以拥有多个账户配置
- 每个对话属于唯一用户
- 消息按时间顺序组织
- Token 消耗需要跟踪和限制

## Important Constraints

### 技术约束

- **性能要求**：必须解决 N+1 查询问题，避免 OOM 风险
- **类型安全**：前后端都必须保证类型安全
- **API 兼容性**：遵循 HATEOAS 原则，实现 Richardson 成熟度模型第 3 级
- **数据库一致性**：使用事务确保数据一致性

### 业务约束

- **用户数据隔离**：确保用户只能访问自己的数据
- **API 安全**：实施适当的认证和授权
- **资源限制**：控制 Token 使用量和 API 调用频率

## External Dependencies

### AI 服务依赖

- **DeepSeek API**：用于 AI 对话功能
- **Spring AI**：AI 服务集成框架

### 数据库依赖

- **PostgreSQL**：主数据库
- **H2**：测试数据库

### 开发工具依赖

- **Nx Cloud**：分布式构建和缓存
- **Verdaccio**：本地 npm 注册表
