# @hateoas-ts/resource-react

[![npm version](https://img.shields.io/npm/v/@hateoas-ts/resource-react.svg)](https://www.npmjs.com/package/@hateoas-ts/resource-react)
[![npm downloads](https://img.shields.io/npm/dm/@hateoas-ts/resource-react.svg)](https://www.npmjs.com/package/@hateoas-ts/resource-react)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.0+-blue.svg)](https://www.typescriptlang.org/)
[![React](https://img.shields.io/badge/React-18%20%7C%2019-61dafb.svg)](https://react.dev/)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

**语言**: [English](./README.md) | [中文](./README_zh.md)

类型安全的 HATEOAS API 导航 React hooks。基于 [`@hateoas-ts/resource`](https://www.npmjs.com/package/@hateoas-ts/resource) 构建。

## 安装

```bash
npm install @hateoas-ts/resource-react @hateoas-ts/resource
```

## 快速开始

### 1. 设置 Provider

```tsx
import { createClient } from '@hateoas-ts/resource';
import { ResourceProvider } from '@hateoas-ts/resource-react';

const client = createClient({ baseURL: 'https://api.example.com' });

function App() {
  return (
    <ResourceProvider client={client}>
      <YourApp />
    </ResourceProvider>
  );
}
```

### 2. 定义实体类型

```typescript
import { Entity, Collection } from '@hateoas-ts/resource';

export type User = Entity<{ id: string; name: string; email: string }, { self: User; conversations: Collection<Conversation> }>;

export type Conversation = Entity<{ id: string; title: string }, { self: Conversation }>;
```

### 3. 使用 Hooks

```tsx
import { useResource, useInfiniteCollection, useClient } from '@hateoas-ts/resource-react';

function UserProfile({ userId }: { userId: string }) {
  const client = useClient();
  const userResource = client.go<User>(`/api/users/${userId}`);

  // 获取单个资源
  const { loading, error, data } = useResource(userResource);

  if (loading) return <div>加载中...</div>;
  if (error) return <div>错误: {error.message}</div>;

  return <div>欢迎, {data.name}!</div>;
}

function ConversationList({ userId }: { userId: string }) {
  const client = useClient();
  const userResource = client.go<User>(`/api/users/${userId}`);

  // 获取分页集合，支持无限滚动
  const { items, loading, hasNextPage, loadNextPage } = useInfiniteCollection(userResource.follow('conversations'));

  return (
    <div>
      {items.map((item) => (
        <div key={item.data.id}>{item.data.title}</div>
      ))}
      {hasNextPage && (
        <button onClick={loadNextPage} disabled={loading}>
          {loading ? '加载中...' : '加载更多'}
        </button>
      )}
    </div>
  );
}
```

## API 参考

### Provider

| 导出               | 描述                         |
| ------------------ | ---------------------------- |
| `ResourceProvider` | HATEOAS 客户端的上下文提供者 |

### Hooks

| Hook                              | 描述                       |
| --------------------------------- | -------------------------- |
| `useClient()`                     | 访问客户端实例             |
| `useResource(resource)`           | 获取单个资源               |
| `useInfiniteCollection(resource)` | 获取分页集合，支持无限滚动 |

### React 19 Suspense Hooks

| Hook                                      | 描述                       |
| ----------------------------------------- | -------------------------- |
| `useSuspenseResource(resource)`           | 支持 Suspense 的单资源获取 |
| `useSuspenseInfiniteCollection(resource)` | 支持 Suspense 的无限滚动   |

### Suspense 示例 (React 19+)

```tsx
import { Suspense } from 'react';
import { useSuspenseResource, useClient } from '@hateoas-ts/resource-react';

function UserProfile({ userId }: { userId: string }) {
  const client = useClient();
  const { data } = useSuspenseResource(client.go<User>(`/api/users/${userId}`));

  // 无需检查加载状态 - 在数据准备好之前会挂起
  return <div>欢迎, {data.name}!</div>;
}

function App() {
  return (
    <Suspense fallback={<div>加载中...</div>}>
      <UserProfile userId="123" />
    </Suspense>
  );
}
```

## 返回类型

### `useResource` / `useSuspenseResource`

```typescript
{
  loading: boolean; // 加载状态（仅 useResource）
  error: Error | null; // 请求失败时的错误
  data: T['data']; // 实体数据
  resourceState: State<T>; // 包含链接的完整状态
  resource: Resource<T>; // 用于进一步导航的资源
}
```

### `useInfiniteCollection` / `useSuspenseInfiniteCollection`

```typescript
{
  items: State<Element>[];    // 累积的集合项
  loading: boolean;           // 加载状态（仅非 suspense）
  isLoadingMore: boolean;     // 加载更多页面中（仅 suspense）
  hasNextPage: boolean;       // 是否有更多页面
  error: Error | null;        // 请求失败时的错误
  loadNextPage: () => void;   // 加载下一页
}
```

## 相关链接

- [`@hateoas-ts/resource`](https://www.npmjs.com/package/@hateoas-ts/resource) - 核心 HATEOAS 客户端

## 许可证

MIT
