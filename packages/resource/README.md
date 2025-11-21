# TeamAi

<a alt="Nx logo" href="https://nx.dev" target="_blank" rel="noreferrer"><img src="https://raw.githubusercontent.com/nrwl/nx/master/images/nx-logo.png" width="45"></a>

✨ Your new, shiny [Nx workspace](https://nx.dev) is almost ready ✨.

[Learn more about this workspace setup and its capabilities](https://nx.dev/nx-api/next?utm_source=nx_project&utm_medium=readme&utm_campaign=nx_projects) or run `npx nx graph` to visually explore what was created. Now, let's get you up to speed!

## `@team-ai/resource` 使用案例

`@team-ai/resource` 是一个强大的 TypeScript/JavaScript 客户端库，用于与遵循 HAL (Hypertext Application Language) 规范的 REST API 进行交互。它提供了类型安全的资源导航、关系追踪和状态管理。

### 核心概念

该库围绕几个核心概念构建：

- **Entity**: 定义了资源的描述（data）和关系（relations）。
- **Client**: 用于与 API 基础 URL 交互的入口点。
- **Resource**: 代表一个具体的 API 端点。
- **Relation**: 代表从一个资源到其关联资源的导航路径。
- **State**: 包含资源数据、链接、集合和操作方法。

### 基本用法

#### 1. 定义实体类型

首先，使用 `Entity` 和 `Collection` 类型来定义你的数据模型。

```typescript
import { Entity, Collection } from '@team-ai/resource';

// 定义账户实体
export type Account = Entity<{ id: string; provider: string; providerId: string }, { self: Account }>;

// 定义对话实体
export type Conversation = Entity<{ id: string; title: string }, { self: Conversation }>;

// 定义用户实体，包含与其他实体的关系
export type User = Entity<
  { id: string; name: string; email: string },
  {
    self: User;
    accounts: Collection<Account>; // 用户拥有多个账户
    conversations: Collection<Conversation>; // 用户拥有多个对话
    'create-conversation': Conversation; // 用于创建新对话的模板关系
    'latest-conversation': Conversation; // 获取最新对话的关系
  }
>;
```

#### 2. 初始化客户端

创建一个 `Client` 实例，指向你的 API 基础 URL。

```typescript
import { Client } from '@team-ai/resource';

const client = new Client({ baseURL: 'https://api.example.com' });
```

#### 3. 获取并使用资源

通过 `client.root()` 方法获取一个根资源，然后调用 `.get()` 来获取其状态。

```typescript
async function fetchUser(userId: string) {
  // 创建一个指向特定用户资源的 Resource 对象
  const userResource = client.root<User>(`/api/users/${userId}`);

  // 获取资源的状态（包含数据、链接等）
  const userState = await userResource.get();

  // 访问资源数据
  console.log(`用户名: ${userState.data.name}`);
  console.log(`邮箱: ${userState.data.email}`);

  return userState;
}

fetchUser('user-123');
```

#### 4. 通过关系导航资源

使用 `.follow()` 方法来导航到关联的资源，无需手动构建 URL。

```typescript
async function navigateToUserConversations(userId: string) {
  const userResource = client.root<User>(`/api/users/${userId}`);
  const userState = await userResource.get();

  // 创建一个指向用户 'conversations' 关系的 Relation 对象
  const conversationsRelation = userState.follow('conversations');

  // 调用关系以获取对话集合的状态
  const conversationsState = await conversationsRelation.invoke();

  // 遍历集合并打印每个对话的标题
  if (Array.isArray(conversationsState.collection)) {
    conversationsState.collection.forEach((conversationState) => {
      console.log(`对话标题: ${conversationState.data.title}`);
    });
  }
}

navigateToUserConversations('user-123');
```

#### 5. 链式导航

你可以连续调用 `.follow()` 来进行深层导航。

```typescript
async function getFirstConversationOfFirstAccount(userId: string) {
  const userState = await client.root<User>(`/api/users/${userId}`).get();

  // 链式导航：用户 -> 账户集合 -> 第一个账户 -> self 关系
  const firstAccountState = await userState.follow('accounts').follow('self').invoke();

  console.log(`第一个账户提供商: ${firstAccountState.data.provider}`);

  // 假设账户也有对话关系
  // const accountConversations = await firstAccountState.follow('conversations').invoke();
}

getFirstConversationOfFirstAccount('user-123');
```

#### 6. 使用特定操作关系

关系可以代表特定的操作，而不仅仅是数据集合。

```typescript
async function createNewConversationForUser(userId: string) {
  const userState = await client.root<User>(`/api/users/${userId}`).get();

  // 导航到 'create-conversation' 关系
  const createConversationRelation = userState.follow('create-conversation');

  // 假设这是一个 POST 操作，你可能需要提交表单数据
  // const newConversationState = await createConversationRelation.submit({ title: '新对话' });
  // console.log(`新创建的对话ID: ${newConversationState.data.id}`);

  console.log('准备创建新对话...');
}

createNewConversationForUser('user-123');
```

### 总结

`@team-ai/resource` 库通过以下方式简化了与 HAL API 的交互：

- **类型安全**: TypeScript 类型确保了你在访问数据和关系时的正确性。
- **声明式导航**: 使用 `.follow()` 方法，你可以通过语义化的关系名称来导航，而不是硬编码 URL。
- **抽象复杂性**: 库处理了 HAL 响应的解析（`_links`, `_embedded`），为你提供了简洁的 `State` 对象。
- **流畅的 API**: 链式调用使得代码更具可读性和表达性。

要开始使用，请确保你的 API 遵循 HAL 规范，然后按照上述示例定义你的实体类型并开始与 API 交互。
