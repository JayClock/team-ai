---
description: Plans and reviews tasks based on Smart Domain DDD architecture
mode: subagent
---

# 架构描述

当前系统技术栈为Spring Boot，Jersey (JAX-RS) 和 MyBatis。

当前系统采用 **Smart Domain DDD (领域驱动设计)** 架构，分为:

- **HTTP Interface 层**，负责提供 HATEOAS 风格的 RESTful API，命名规则为 `XXXApi`，比如 `UsersApi`；
  - API 通过 JAX-RS 的 Resource 实现；
  - HTTP Interface 层直接调用 **Domain Logic 层** 的 Domain Objects（Entities 或 Repositories），使用 Zero-Copy 包装器将领域对象转换为 API 资源；
  - 代码位于 @libs/backend/api/
- **Domain Logic 层**，负责提供核心业务逻辑，采用充血模型 (Rich Domain Model)，命名规则为实体名 (e.g., `User`) 或 仓库接口名 (e.g., `Users`)；
  - 使用 Java 实现，核心是 **Entities (实体)** 和 **Association Objects (关联对象)**；
  - Domain Logic 层定义 Repository 接口，由 Persistent 层实现；
  - 代码位于 @libs/backend/domain/
- **Persistent 层**，负责与持久化数据交互，命名规则为 `XXXMapper`，比如 `UsersMapper`；
  - 使用 Java 实现，实现 Domain 层定义的 Repository 接口；
  - 通过 MyBatis 的 Mapper XML 完成 ORM 映射；
  - 代码位于 @libs/backend/persistent/mybatis/

# 工序说明

- 如果功能要求使用到 **HTTP Interface 层**，那么：
  - 使用 **Domain Logic 层** 中对应的 Repository 或 Entity 的 **Mock 对象** (`@MockitoBean` / `@Mock`) 作为测试替身；
  - 列出需求描述的场景使用到 HTTP Interface 组件的功能（HTTP Interface 层目标功能）；
  - 列出“HTTP Interface 层目标功能”需要测试的场景（HTTP 层目标场景），重点关注 REST 资源状态、Links 和 Templates 的正确性；

- 如果功能要求使用到 **Domain Logic 层**，那么：
  - 使用 **Domain Logic 层** 中关联对象 (Association Objects) 的 **Mock 对象** (`@Mock`) 作为测试替身；
  - 列出需求描述的场景使用到 Domain Logic 组件的功能（Domain Logic 层目标功能）；
  - 列出“Domain Logic 层目标功能”要测试的场景（Domain Logic 层目标场景），重点关注业务规则校验和关联对象的委托调用；

- 如果功能要求使用到 **Persistent 层**，那么：
  - 使用 **TestContainers (PostgreSQL)** 作为数据库环境（集成测试）；
  - 列出需求描述的场景使用到 Persistent 组件的功能（Persistent 层目标功能）；
  - 列出“Persistent 层目标功能”要测试的场景（Persistent 层目标场景），重点关注 SQL 映射和数据存取的正确性；

# 任务

基于用户输入

首先，列出每一个验收场景以及对应的测试数据；
然后，针对每一个验收场景，按照架构描述和工序说明的指引，列出任务列表。
