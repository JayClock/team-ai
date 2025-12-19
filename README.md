# Team AI - Smart Domain DDD & HATEOAS 代码样例

[![Nx](https://raw.githubusercontent.com/nrwl/nx/master/images/nx-logo.png)](https://nx.dev)

**Team AI** 是一个使用 **Smart Domain (智能领域模型)** 实现 **领域驱动设计 (DDD)** 和 **HATEOAS** 的代码样例项目。本项目展示了如何通过高内聚的领域模型直接驱动业务逻辑和 RESTful HATEOAS 接口，解决传统架构中的性能瓶颈与逻辑分散问题。

## 📚 推荐阅读顺序

为了更好地理解本项目，建议按以下顺序阅读相关文档：

1. [Smart Domain DDD 架构设计](libs/backend/README.md) - 完整的架构设计文档，理解核心设计理念
2. [REST 原则与智能 UI](public/REST_Principles_Agentic_UI.pdf) - REST 架构原则与智能 UI 设计详解
3. [HATEOAS 客户端实现](packages/resource/README.md) - TypeScript/JavaScript 客户端库文档

## 🏗️ 架构概览

### Smart Domain DDD 实现

本项目摒弃了传统的"贫血模型 + Service 脚本"架构，采用 **Smart Domain (智能领域模型)** 模式来实现真正的领域驱动设计。

#### 核心特性

- **关联对象模式**：解决领域驱动设计中最棘手的性能与模型纯洁性冲突
- **宽窄接口分离**：确保业务逻辑封装性和状态变更安全可控
- **集体逻辑封装**：通过意图揭示的接口设计，实现高性能的业务逻辑处理
- **HATEOAS RESTful API**：实现 Richardson 成熟度模型第 3 级的渐进式披露机制

#### 领域模型示例

- **User**: 聚合根，系统的入口与身份标识
- **Account**: 用户的配置与账户信息（如 API Key 管理）
- **Conversation**: 用户发起的对话上下文，作为业务逻辑载体
- **Message**: 对话中的具体交互记录

### HATEOAS 客户端库 (@hateoas-ts/resource)

`@hateoas-ts/resource` 是一个 TypeScript/JavaScript 客户端库实现，展示了如何与遵循 HAL (Hypertext Application Language) 规范的 REST API 进行交互。

#### 核心特性

- **类型安全**: TypeScript 类型确保访问数据和关系时的正确性
- **声明式导航**: 使用语义化的关系名称来导航，而非硬编码 URL
- **流畅的 API**: 链式调用使代码更具可读性和表达性
- **灵活的缓存**: 多种缓存策略适应不同的应用场景
- **事件驱动**: 通过事件监听响应资源状态的变化

## 🚀 快速开始

### 环境要求

- Node.js 18+
- Java 17+
- PostgreSQL 14+ (可选，用于持久化层示例)

### 安装依赖

```bash
# 安装所有依赖
npm install

# 或使用 pnpm
pnpm install
```

### 运行示例

```bash
# 启动开发环境
npx nx dev team-ai

# 构建项目
npx nx build team-ai

# 运行测试
npx nx test
```

### 数据库设置 (可选)

如果需要运行持久化层示例，请参考 [数据库设置文档](docs/database-setup.md)

## 📚 文档导航

### 核心技术文档

- [Smart Domain DDD 架构设计](libs/backend/README.md) - 完整的架构设计文档
  - Smart Domain 模式详解
  - 关联对象 (Association Object) 设计
  - 宽窄接口分离策略
  - HATEOAS RESTful API 设计

- [HATEOAS 客户端实现](packages/resource/README.md) - TypeScript/JavaScript 客户端库文档
  - 基本用法和 API 参考
  - 高级用法和最佳实践
  - 中间件和缓存策略
  - 错误处理和事件监听

### 补充文档

- [数据库设置](docs/database-setup.md) - PostgreSQL 配置和迁移指南
- [PostgreSQL 迁移总结](docs/postgresql-migration-summary.md) - 数据库迁移详细记录

## 🛠️ 开发指南

### 项目结构

```
team-ai/
├── apps/                    # 示例应用程序
│   ├── server/             # 后端服务器示例 (Java Spring Boot)
│   └── web/                # 前端应用示例 (React)
├── libs/                   # 后端核心库
│   └── backend/            # Smart Domain DDD 实现
│       ├── api/            # HATEOAS API 层
│       ├── domain/         # 领域模型和业务逻辑
│       └── persistent/     # 持久化层示例
├── packages/               # 前端包
│   └── resource/           # HATEOAS 客户端库实现
└── docs/                   # 技术文档
```

### 可用命令

```bash
# 查看所有可用项目
npx nx show projects

# 查看特定项目的可用目标
npx nx show project team-ai

# 查看项目依赖图
npx nx graph
```

### 代码生成

使用 Nx 插件生成新代码：

```bash
# 生成新应用
npx nx g @nx/next:app demo

# 生成新库
npx nx g @nx/react:lib mylib
```

## 🏛️ 架构设计原则

### Smart Domain DDD 核心理念

1. **跨越性能与模型的障碍**：通过关联对象解决 N+1 问题
2. **保护业务逻辑封装**：宽窄接口分离确保状态变更安全可控
3. **意图揭示接口**：通过语义化方法名表达业务意图
4. **低成本 HATEOAS**：同构映射实现渐进式披露机制

### HATEOAS 客户端设计原则

1. **类型安全优先**：确保编译时错误检查
2. **声明式交互**：通过语义化关系导航资源
3. **性能优化**：智能缓存和请求去重
4. **事件驱动**：响应式状态管理

## 🤝 贡献指南

我们欢迎社区贡献！请遵循以下步骤：

1. Fork 项目
2. 创建特性分支 (`git checkout -b feature/AmazingFeature`)
3. 提交更改 (`git commit -m 'Add some AmazingFeature'`)
4. 推送到分支 (`git push origin feature/AmazingFeature`)
5. 开启 Pull Request

## 📄 许可证

本项目采用 MIT 许可证 - 查看 [LICENSE](LICENSE) 文件了解详情

## 🔗 有用链接

### 学习资源

- [Nx 官方文档](https://nx.dev)
- [Smart Domain 架构详解](libs/backend/README.md)
- [HATEOAS 客户端库文档](packages/resource/README_ZH.md)

### 社区

- [Nx Discord](https://go.nx.dev/community)
- [Nx Twitter](https://twitter.com/nxdevtools)
- [Nx LinkedIn](https://www.linkedin.com/company/nrwl)
- [Nx YouTube 频道](https://www.youtube.com/@nxdevtools)

---

**Team AI** - Smart Domain 实现 DDD & HATEOAS 的代码样例项目。
