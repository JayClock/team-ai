# @hateoas-ts/resource

[![npm version](https://img.shields.io/npm/v/@hateoas-ts/resource?style=flat-square)](https://www.npmjs.com/package/@hateoas-ts/resource)
[![npm downloads](https://img.shields.io/npm/dm/@hateoas-ts/resource?style=flat-square)](https://www.npmjs.com/package/@hateoas-ts/resource)
[![bundle size](https://img.shields.io/bundlephobia/minzip/@hateoas-ts/resource?style=flat-square)](https://bundlephobia.com/package/@hateoas-ts/resource)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.0+-blue?style=flat-square)](https://www.typescriptlang.org/)
[![License](https://img.shields.io/npm/l/@hateoas-ts/resource?style=flat-square)](./LICENSE)

> 类型安全的 HATEOAS 客户端，支持 HAL API 自动链接导航、缓存和中间件。

**语言**: [English](./README.md) | [中文](./README_ZH.md)

## 安装

```bash
npm install @hateoas-ts/resource
# 或
yarn add @hateoas-ts/resource
# 或
pnpm add @hateoas-ts/resource
```

## 快速开始

```typescript
import { createClient, Entity, Collection } from '@hateoas-ts/resource';

// 1. 定义实体类型
type Post = Entity<{ id: string; title: string; content: string }, { self: Post; author: User }>;

type User = Entity<{ id: string; name: string; email: string }, { self: User; posts: Collection<Post> }>;

// 2. 创建客户端
const client = createClient({ baseURL: 'https://api.example.com' });

// 3. 导航资源
const user = await client.go<User>('/users/123').get();
console.log(user.data.name);

// 4. 跟随 HATEOAS 链接 - 无需硬编码 URL！
const posts = await user.follow('posts').get();
for (const post of posts.collection) {
  console.log(post.data.title);
}
```

## 核心概念

| 概念           | 描述                                     |
| -------------- | ---------------------------------------- |
| **Entity**     | 类型安全的资源定义，包含数据、链接和操作 |
| **Collection** | 带导航链接的分页实体列表                 |
| **Resource**   | 表示带 HTTP 方法的 API 端点              |
| **State**      | 包含资源数据、链接和集合项               |
| **Middleware** | 拦截和修改请求/响应                      |

## API 方法

### 读取操作

```typescript
// GET 请求（自动缓存）
const user = await client.go<User>('/users/123').get();

// 访问数据
console.log(user.data.name);
console.log(user.data.email);
```

### 导航

```typescript
// 跟随链接到相关资源
const posts = await user.follow('posts').get();

// 带 URI 模板参数的跟随
const filtered = await user.follow('posts', { page: 2, size: 10 }).get();

// 链式导航
const author = await posts.collection[0].follow('author').get();
```

### 写入操作

```typescript
// POST - 创建新资源
const newPost = await user.follow('posts').post({
  data: { title: 'Hello World', content: '我的第一篇文章' },
});

// PUT - 完整更新
await post.put({
  data: { title: '更新的标题', content: '更新的内容' },
});

// PATCH - 部分更新
await post.patch({
  data: { title: '新标题' },
});

// DELETE - 删除
await post.delete();
```

### 中间件

```typescript
// 添加认证
client.use(async (request, next) => {
  request.headers.set('Authorization', `Bearer ${token}`);
  return next(request);
});

// 为特定源添加日志
client.use(async (request, next) => {
  console.log('请求:', request.url);
  const response = await next(request);
  console.log('响应:', response.status);
  return response;
}, 'https://api.example.com');
```

### 缓存

```typescript
// GET 请求自动缓存
const user1 = await client.go<User>('/users/123').get();
const user2 = await client.go<User>('/users/123').get(); // 从缓存获取

// 手动缓存操作
resource.clearCache();
const cached = resource.getCache();
resource.updateCache(newState);
```

### 事件

```typescript
const resource = client.go<User>('/users/123');

// 监听更新
resource.on('update', (state) => {
  console.log('资源已更新:', state.data);
});

// 监听过期事件（在 POST/PUT/PATCH/DELETE 之后）
resource.on('stale', () => {
  console.log('缓存已过期，建议重新获取');
});

// 监听删除
resource.on('delete', () => {
  console.log('资源已删除');
});
```

### 集合

```typescript
const postsState = await user.follow('posts').get();

// 分页元数据
console.log(`第 ${postsState.data.page.number + 1} 页，共 ${postsState.data.page.totalPages} 页`);
console.log(`总计: ${postsState.data.page.totalElements} 条`);

// 迭代项目
for (const post of postsState.collection) {
  console.log(post.data.title);
}

// 页面导航
const nextPage = await postsState.follow('next').get();
const prevPage = await postsState.follow('prev').get();
```

## 类型定义

### Entity

```typescript
import { Entity } from '@hateoas-ts/resource';

// Entity<TData, TLinks, TActions>
type User = Entity<
  // TData - 资源属性
  { id: string; name: string; email: string },
  // TLinks - 可用的导航链接
  {
    self: User;
    posts: Collection<Post>;
    'create-post': Post;
  },
  // TActions - HAL-Forms 操作（可选）
  {
    'create-post': Post;
  }
>;
```

### Collection

```typescript
import { Collection } from '@hateoas-ts/resource';

// Collection 自动包含：
// - page: { size, totalElements, totalPages, number }
// - links: { first, prev, self, next, last }
type Posts = Collection<Post>;
```

## API 参考

📚 **[完整 API 文档](https://jayclock.github.io/team-ai/packages/resource/)**

### 主要导出

| 导出               | 类型 | 描述                       |
| ------------------ | ---- | -------------------------- |
| `createClient`     | 函数 | 创建 HATEOAS 客户端实例    |
| `Entity`           | 类型 | 定义带数据和链接的实体类型 |
| `Collection`       | 类型 | 定义分页集合类型           |
| `Resource`         | 类   | 资源导航和 HTTP 方法       |
| `ResourceRelation` | 类   | 关系导航                   |
| `State`            | 类型 | 带数据和链接的资源状态     |
| `FetchMiddleware`  | 类型 | 请求/响应中间件类型        |

## React 集成

参见 [@hateoas-ts/resource-react](../resource-react/README.md) 获取 React hooks:

```typescript
import { useResource, useInfiniteCollection } from '@hateoas-ts/resource-react';

function UserProfile({ userId }) {
  const { data, loading, error } = useResource<User>(`/users/${userId}`);

  if (loading) return <Spinner />;
  if (error) return <Error message={error.message} />;

  return <div>{data.name}</div>;
}
```

## 相关文档

- [Smart Domain DDD 架构](../../libs/backend/README.md) - 后端架构设计
- [REST 原则与智能 UI](../../public/REST_Principles_Agentic_UI.pdf) - REST 架构原则

## 更新日志

### 版本 1.4.0（当前）

- 直接 HTTP 方法：`.get()`, `.post()`, `.put()`, `.patch()`, `.delete()`
- 并发请求去重
- 改进的 TypeScript 泛型

### 版本 1.3.0

- React 集成工具（`@hateoas-ts/resource-react`）
- 增强的缓存策略

### 版本 1.2.0

- 基本 HAL 资源导航
- 类型安全的实体定义
- 缓存管理
- 事件系统
- 中间件支持

## 许可证

MIT
