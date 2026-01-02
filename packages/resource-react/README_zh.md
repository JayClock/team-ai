# @hateoas-ts/resource-react

<a alt="Nx logo" href="https://nx.dev" target="_blank" rel="noreferrer"><img src="https://raw.githubusercontent.com/nrwl/nx/master/images/nx-logo.png" width="45"></a>

**语言**: [English](./README.md) | [中文](./README_zh.md)

`@hateoas-ts/resource-react` 提供了用于与遵循 HAL（超文本应用语言）规范的 REST API 进行交互的 React hooks 和组件。它是 [`@hateoas-ts/resource`](../resource/README_ZH.md) 的 React 集成层。

## 📚 文档

为了更好地理解 HATEOAS 客户端实现和 React 集成，建议按以下顺序阅读文档：

1. [智慧领域 DDD 架构](../../libs/backend/README.md) - 完整的架构设计文档，了解核心设计原则
2. [`@hateoas-ts/resource` 文档](../resource/README_ZH.md) - 核心 TypeScript/JavaScript 客户端库文档
3. **本文档** - React hooks 和组件集成

## 安装

```bash
npm install @hateoas-ts/resource-react
# 或
yarn add @hateoas-ts/resource-react
# 或
pnpm add @hateoas-ts/resource-react
```

## 核心概念

`@hateoas-ts/resource-react` 库提供了围绕核心 `@hateoas-ts/resource` 库的 React 友好封装：

- **ResourceProvider**: 用于注入 HATEOAS 客户端的上下文提供者
- **useClient**: 访问客户端实例的 Hook
- **useInfiniteCollection**: 处理集合资源的无限滚动/分页的 Hook
- **useResolveResource**: 解析资源类对象的内部 Hook

## 基本用法

### 1. 使用 ResourceProvider 包装应用

首先，创建一个客户端实例，并用 `ResourceProvider` 包装您的应用程序：

```tsx
import { createClient } from '@hateoas-ts/resource';
import { ResourceProvider } from '@hateoas-ts/resource-react';

const client = createClient({
  baseURL: 'https://api.example.com'
});

function App() {
  return (
    <ResourceProvider client={client}>
      {/* 您的应用组件 */}
    </ResourceProvider>
  );
}
```

### 2. 定义实体类型

使用 `@hateoas-ts/resource` 中的 `Entity` 和 `Collection` 类型来定义您的数据模型：

```typescript
import { Entity, Collection } from '@hateoas-ts/resource';

// 定义 Account 实体
export type Account = Entity<{
  id: string;
  provider: string;
  providerId: string;
}, {
  self: Account;
}>;

// 定义 Conversation 实体
export type Conversation = Entity<{
  id: string;
  title: string;
}, {
  self: Conversation;
}>;

// 定义具有关系的 User 实体
export type User = Entity<{
  id: string;
  name: string;
  email: string;
}, {
  self: User;
  accounts: Collection<Account>;
  conversations: Collection<Conversation>;
  'create-conversation': Conversation;
}>;
```

### 3. 使用 useClient Hook

使用 `useClient` hook 在您的组件中访问客户端实例：

```tsx
import { useClient } from '@hateoas-ts/resource-react';
import type { User } from './types';

function UserProfile({ userId }: { userId: string }) {
  const client = useClient();

  const [user, setUser] = useState<UserState | null>(null);

  useEffect(() => {
    client.go<User>(`/api/users/${userId}`)
      .request()
      .then(setUser);
  }, [client, userId]);

  if (!user) return <div>加载中...</div>;

  return <div>{user.data.name}</div>;
}
```

### 4. 使用 useInfiniteCollection Hook

`useInfiniteCollection` hook 专用于处理具有无限滚动功能的分页集合：

```tsx
import { useInfiniteCollection } from '@hateoas-ts/resource-react';
import { useClient } from '@hateoas-ts/resource-react';
import type { User } from './types';

function UserConversations({ userId }: { userId: string }) {
  const client = useClient();
  const userResource = client.go<User>(`/api/users/${userId}`);

  const {
    items,
    loading,
    hasNextPage,
    error,
    loadNextPage
  } = useInfiniteCollection(userResource.follow('conversations'));

  return (
    <div>
      <h2>会话列表</h2>

      {error && <div>错误: {error.message}</div>}

      <ul>
        {items.map((conversationState) => (
          <li key={conversationState.data.id}>
            {conversationState.data.title}
          </li>
        ))}
      </ul>

      {loading && <div>加载更多...</div>}

      {hasNextPage && !loading && (
        <button onClick={loadNextPage}>
          加载更多
        </button>
      )}
    </div>
  );
}
```

## API 参考

### ResourceProvider

上下文提供者组件，使 HATEOAS 客户端可用于所有子组件。

**属性：**
- `client: Client` - HATEOAS 客户端实例
- `children: React.ReactNode` - 子组件

**示例：**
```tsx
<ResourceProvider client={client}>
  <App />
</ResourceProvider>
```

### useClient()

从上下文中访问 HATEOAS 客户端实例的 Hook。

**返回值：**
- `Client` - HATEOAS 客户端实例

**抛出：**
- 如果在 `ResourceProvider` 外使用则抛出错误

**示例：**
```tsx
const client = useClient();
const userResource = client.go<User>('/api/users/123');
```

### useInfiniteCollection<T extends Entity>(resourceLike: ResourceLike<T>)

用于管理集合资源的无限滚动/分页的 Hook。

**参数：**
- `resourceLike: ResourceLike<T>` - 指向集合的资源或资源关系

**返回值：**
```typescript
{
  items: State<ExtractCollectionElement<T>>[];  // 集合项状态的数组
  loading: boolean;                              // 加载指示器
  hasNextPage: boolean;                          // 是否有下一页
  error: Error | null;                           // 错误对象
  loadNextPage: () => void;                      // 加载下一页的函数
}
```

**特性：**
- 自动获取初始页面
- 跨页面维护累积的项目
- 遵循 HAL "next" 链接进行分页
- 处理加载和错误状态
- 在遵循分页链接时保留项目关系上下文

**重要提示：**
- 不要记忆或存储 `loadNextPage` 函数引用
- 始终使用 hook 返回的最新 `loadNextPage` 函数

**示例：**
```tsx
const {
  items,
  loading,
  hasNextPage,
  error,
  loadNextPage
} = useInfiniteCollection(userResource.follow('conversations'));

// 加载更多项目
<button onClick={loadNextPage} disabled={!hasNextPage || loading}>
  {loading ? '加载中...' : '加载更多'}
</button>
```

## 高级用法

### 自定义资源读取 Hooks

您可以创建自定义 hooks 来封装资源读取逻辑：

```tsx
import { useReadResource } from '@hateoas-ts/resource-react';
import type { User } from './types';

function useUser(userId: string) {
  const client = useClient();
  const userResource = client.go<User>(`/api/users/${userId}`);

  const {
    loading,
    error,
    resourceState,
    resource
  } = useReadResource(userResource);

  return {
    user: resourceState,
    loading,
    error
  };
}

// 使用
function UserProfile({ userId }: { userId: string }) {
  const { user, loading, error } = useUser(userId);

  if (loading) return <div>加载中...</div>;
  if (error) return <div>错误: {error.message}</div>;
  if (!user) return null;

  return <div>{user.data.name}</div>;
}
```

### 组合多个资源

您可以在单个组件中使用多个 hooks 来处理不同的资源：

```tsx
function UserDashboard({ userId }: { userId: string }) {
  const client = useClient();

  const userResource = client.go<User>(`/api/users/${userId}`);
  const { resourceState: user } = useReadResource(userResource);

  const conversations = useInfiniteCollection(
    userResource.follow('conversations')
  );

  const accounts = useInfiniteCollection(
    userResource.follow('accounts')
  );

  return (
    <div>
      <h1>欢迎 {user?.data.name}</h1>

      <section>
        <h2>会话</h2>
        {conversations.items.map(conv => (
          <div key={conv.data.id}>{conv.data.title}</div>
        ))}
      </section>

      <section>
        <h2>账户</h2>
        {accounts.items.map(acc => (
          <div key={acc.data.id}>{acc.data.provider}</div>
        ))}
      </section>
    </div>
  );
}
```

### 错误处理

使用 try-catch 和错误状态优雅地处理错误：

```tsx
function UserConversations({ userId }: { userId: string }) {
  const client = useClient();
  const userResource = client.go<User>(`/api/users/${userId}`);

  const {
    items,
    loading,
    hasNextPage,
    error,
    loadNextPage
  } = useInfiniteCollection(userResource.follow('conversations'));

  if (error) {
    return (
      <div>
        <h3>加载会话时出错</h3>
        <p>{error.message}</p>
        <button onClick={() => window.location.reload()}>
          重试
        </button>
      </div>
    );
  }

  // ... 组件其余部分
}
```

## 测试

使用 Vitest 运行单元测试：

```bash
nx test @hateoas-ts/resource-react
```

## 示例

### 完整示例：用户会话列表

```tsx
import React from 'react';
import { createClient } from '@hateoas-ts/resource';
import { ResourceProvider, useInfiniteCollection } from '@hateoas-ts/resource-react';
import type { User, Conversation } from './types';

// 创建客户端
const client = createClient({
  baseURL: 'https://api.example.com'
});

// 会话列表组件
function ConversationsList({ userId }: { userId: string }) {
  const client = useClient();
  const userResource = client.go<User>(`/api/users/${userId}`);

  const {
    items,
    loading,
    hasNextPage,
    error,
    loadNextPage
  } = useInfiniteCollection(userResource.follow('conversations'));

  if (error) {
    return <div>错误: {error.message}</div>;
  }

  return (
    <div>
      <ul>
        {items.map((conversation) => (
          <li key={conversation.data.id}>
            {conversation.data.title}
          </li>
        ))}
      </ul>

      {loading && <div>加载更多会话中...</div>}

      {hasNextPage && !loading && (
        <button onClick={loadNextPage}>
          加载更多
        </button>
      )}

      {!hasNextPage && items.length > 0 && (
        <div>没有更多会话了</div>
      )}
    </div>
  );
}

// 应用组件
function App() {
  return (
    <ResourceProvider client={client}>
      <ConversationsList userId="user-123" />
    </ResourceProvider>
  );
}

export default App;
```

## 相关包

- [`@hateoas-ts/resource`](../resource/README_ZH.md) - 核心 HATEOAS 客户端库
- [`@hateoas-ts/resource-react`] - React 集成（本包）

## 许可证

[在此处添加您的许可证信息]

## 贡献

欢迎贡献！请随时提交 Pull Request。
