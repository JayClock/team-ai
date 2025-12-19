# @hateoas-ts/resource

<a alt="Nx logo" href="https://nx.dev" target="_blank" rel="noreferrer"><img src="https://raw.githubusercontent.com/nrwl/nx/master/images/nx-logo.png" width="45"></a>

**语言**: [中文](https://github.com/JayClock/team-ai/blob/main/packages/resource/README_ZH.md) | [English](https://github.com/JayClock/team-ai/blob/main/packages/resource/README.md)

`@hateoas-ts/resource` 是一个强大的 TypeScript/JavaScript 客户端库，用于与遵循 HAL (Hypertext Application Language) 规范的 REST API 进行交互。它提供了类型安全的资源导航、关系追踪和状态管理。

## 📚 推荐阅读顺序

为了更好地理解 HATEOAS 客户端实现，建议按以下顺序阅读相关文档：

1. [Smart Domain DDD 架构实现](../../libs/backend/README.md) - 完整的架构设计文档，理解核心设计理念
2. **本文档** - TypeScript/JavaScript 客户端库文档
3. [REST 原则与智能 UI](../../public/REST_Principles_Agentic_UI.pdf) - REST 架构原则与智能 UI 设计详解

## 安装

```bash
npm install @hateoas-ts/resource
# 或
yarn add @hateoas-ts/resource
# 或
pnpm add @hateoas-ts/resource
```

## 核心概念

该库围绕几个核心概念构建：

- **Entity**: 定义了资源的描述（data）和关系（links）。
- **Client**: 用于与 API 基础 URL 交互的入口点。
- **Resource**: 代表一个具体的 API 端点。
- **State**: 包含资源数据、链接、集合和操作方法。
- **Cache**: 用于缓存资源状态，提高性能。

## 基本用法

### 1. 定义实体类型

首先，使用 `Entity` 和 `Collection` 类型来定义你的数据模型。

```typescript
import { Entity, Collection } from '@hateoas-ts/resource';

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

### 2. 初始化客户端

创建一个 `Client` 实例，指向你的 API 基础 URL。

```typescript
import { createClient } from '@hateoas-ts/resource';

const client = createClient({ baseURL: 'https://api.example.com' });
```

### 3. 获取并使用资源

通过 `client.go()` 方法获取一个根资源，然后调用 `.request()` 来获取其状态。默认情况下，链式调用使用 GET 方法，符合 RESTful 的发现规范。

```typescript
async function fetchUser(userId: string) {
  // 创建一个指向特定用户资源的 Resource 对象
  const userResource = client.go<User>(`/api/users/${userId}`);

  // 默认使用 GET 方法获取资源的状态（包含数据、链接等）
  const userState = await userResource.request();

  // 访问资源数据
  console.log(`用户名: ${userState.data.name}`);
  console.log(`邮箱: ${userState.data.email}`);

  return userState;
}

fetchUser('user-123');
```

如果需要明确指定方法，可以使用 `withMethod()`：

```typescript
// 明确指定 GET 方法
const userState = await userResource.withMethod('GET').request();
```

### 4. 通过关系导航资源

使用 `.follow()` 方法来导航到关联的资源，无需手动构建 URL。`follow()` 方法返回 `ResourceRelation` 对象，可以继续链式调用或直接请求。

```typescript
async function navigateToUserConversations(userId: string) {
  const userResource = client.go<User>(`/api/users/${userId}`);
  const userState = await userResource.request(); // 默认 GET

  // 创建一个指向用户 'conversations' 关系的 ResourceRelation 对象
  const conversationsRelation = userState.follow('conversations');

  // 调用关系以获取对话集合的状态（默认 GET）
  const conversationsState = await conversationsRelation.request();

  // 遍历集合并打印每个对话的标题
  if (Array.isArray(conversationsState.collection)) {
    conversationsState.collection.forEach((conversationState) => {
      console.log(`对话标题: ${conversationState.data.title}`);
    });
  }
}

navigateToUserConversations('user-123');
```

### 5. 链式导航

你可以连续调用 `.follow()` 来进行深层导航。每次 `follow()` 调用都会返回一个新的 `ResourceRelation` 对象，支持链式调用。

```typescript
async function getFirstConversationOfFirstAccount(userId: string) {
  const userState = await client.go<User>(`/api/users/${userId}`).request(); // 默认 GET

  // 链式导航：用户 -> 账户集合 -> 第一个账户 -> self 关系
  // 所有导航步骤默认都使用 GET 方法
  const firstAccountState = await userState.follow('accounts').follow('self').request();

  console.log(`第一个账户提供商: ${firstAccountState.data.provider}`);

  // 假设账户也有对话关系
  // const accountConversations = await firstAccountState.follow('conversations').request(); // 默认 GET
}

getFirstConversationOfFirstAccount('user-123');
```

### 6. 使用特定操作关系

关系可以代表特定的操作，而不仅仅是数据集合。

```typescript
async function createNewConversationForUser(userId: string) {
  const userState = await client.go<User>(`/api/users/${userId}`).request(); // 默认 GET

  // 导航到 'create-conversation' 关系
  const createConversationRelation = userState.follow('create-conversation');

  // 使用 withMethod 指定 POST 方法，然后提交表单数据创建新对话
  const newConversationState = await createConversationRelation.withMethod('POST').request({
    data: { title: '新对话' }
  });
  
  console.log(`新创建的对话ID: ${newConversationState.data.id}`);
}

createNewConversationForUser('user-123');
```

## API 参考

### createClient(options: Config): Client

创建一个新的客户端实例。

**参数:**
- `options`: 配置对象
  - `baseURL`: API 基础 URL
  - `sendUserAgent`: 是否发送 User-Agent 头（可选）

**返回值:**
- `Client`: 客户端实例

### Client

#### client.go<TEntity extends Entity>(link?: string | NewLink): Resource<TEntity>

创建一个指向特定资源的 Resource 对象。

**参数:**
- `link`: 资源链接（可选）
  - 如果是字符串，则相对于 baseURL 的路径
  - 如果是 NewLink 对象，则包含更详细的链接信息

**返回值:**
- `Resource<TEntity>`: 资源对象

#### client.use(middleware: FetchMiddleware, origin?: string): void

添加一个 fetch 中间件，用于每个 fetch() 调用。

**参数:**
- `middleware`: 中间件函数
- `origin`: 中间件应用的源（可选，默认为 '*'）

### Resource<TEntity extends Entity>

#### resource.fetch(init?: RequestInit): Promise<Response>

在当前资源 URI 上执行 HTTP 请求。

**参数:**
- `init`: RequestInit 对象（可选），用于配置请求

**返回值:**
- `Promise<Response>`: HTTP 响应对象

**示例:**
```typescript
// 简单的 GET 请求
const response = await resource.fetch();

// 带有自定义头的请求
const response = await resource.fetch({
  headers: { 'Authorization': 'Bearer token' }
});

// POST 请求
const response = await resource.fetch({
  method: 'POST',
  body: JSON.stringify({ name: '新名称' }),
  headers: { 'Content-Type': 'application/json' }
});
```

#### resource.fetchOrThrow(init?: RequestInit): Promise<Response>

在当前资源 URI 上执行 HTTP 请求。如果响应是 4XX 或 5XX 状态码，此函数将抛出异常。

**参数:**
- `init`: RequestInit 对象（可选），用于配置请求

**返回值:**
- `Promise<Response>`: HTTP 响应对象

**示例:**
```typescript
try {
  const response = await resource.fetchOrThrow();
  console.log('请求成功:', response.status);
} catch (error) {
  console.error('请求失败:', error.status, error.message);
}
```

#### resource.request(options?: RequestOptions, form?: Form): Promise<State<TEntity>>

发送一个 HTTP 请求并获取资源的当前状态。默认使用 GET 方法，符合 RESTful 的发现规范。

**参数:**
- `options`: 请求选项（可选）
  - `data`: 请求体数据
  - `headers`: 请求头
  - `query`: 查询参数
  - `serializeBody`: 自定义序列化函数
  - `getContentHeaders`: 获取内容头的函数
- `form`: 表单对象（可选）

**返回值:**
- `Promise<State<TEntity>>`: 资源状态

**示例:**
```typescript
// 默认 GET 请求，符合 RESTful 发现规范
const state = await resource.request();

// 明确指定 GET 方法
const getState = await resource.withMethod('GET').request();

// POST 请求（需要明确指定方法）
const newState = await resource.withMethod('POST').request({
  data: { name: '新名称' }
});
```

#### resource.updateCache(state: State<TEntity>): void

更新状态缓存并触发事件。这将更新本地状态但不会更新服务器。

**参数:**
- `state`: 要缓存的状态对象

**异常:**
- 如果状态对象的 URI 与资源的 URI 不匹配，将抛出错误

**示例:**
```typescript
const newState = /* 获取新状态 */;
resource.updateCache(newState);
```

#### resource.clearCache(): void

清除当前资源的缓存。

**示例:**
```typescript
resource.clearCache();
```

#### resource.getCache(): State<TEntity> | null

检索当前缓存的资源状态，如果不可用则返回 null。

**返回值:**
- `State<TEntity> | null`: 缓存的状态对象或 null

**示例:**
```typescript
const cachedState = resource.getCache();
if (cachedState) {
  console.log('从缓存获取数据:', cachedState.data);
} else {
  console.log('缓存中没有数据');
}
```

#### resource.follow<K extends keyof TEntity['links']>(rel: K): ResourceRelation<TEntity['links'][K]>

根据关系类型 (rel) 跟踪资源关系。

**参数:**
- `rel`: 关系类型，必须是实体链接中定义的键之一

**返回值:**
- `ResourceRelation<TEntity['links'][K]>`: 关联资源的 ResourceRelation 对象

#### resource.withMethod(method: HttpMethod): Resource<TEntity>

设置 HTTP 请求方法。

**参数:**
- `method`: 要设置的 HTTP 方法

**返回值:**
- `Resource<TEntity>`: 当前资源对象（支持链式调用）

**示例:**
```typescript
// 默认 GET 请求（无需指定方法）
const getState = await resource.request();

// 明确指定 GET 方法
const explicitGetState = await resource.withMethod('GET').request();

// 设置 POST 方法（必须指定）
const postState = await resource.withMethod('POST').request({
  data: { title: '新标题' }
});

// 链式调用
const result = await resource
  .withMethod('PUT')
  .withTemplateParameters({ id: '123' })
  .request({ data: { name: '更新名称' } });
```

#### resource.withTemplateParameters(variables: LinkVariables): Resource<TEntity>

设置 URI 模板参数。

**参数:**
- `variables`: 要设置的模板参数变量

**返回值:**
- `Resource<TEntity>`: 当前资源对象（支持链式调用）

**示例:**
```typescript
// 设置模板参数
const resource = client.go<User>('/api/users/{userId}')
  .withTemplateParameters({ userId: '123' });

// 与 withMethod 链式使用
const state = await resource
  .withTemplateParameters({ userId: '123' })
  .withMethod('GET')
  .request();
```

### ResourceRelation<TEntity extends Entity>

ResourceRelation 类用于处理资源关系的导航，支持链式调用和参数设置。

#### relation.request(requestOptions?: RequestOptions): Promise<State<TEntity>>

执行资源请求，获取资源状态。

**参数:**
- `requestOptions`: 请求选项（可选）

**返回值:**
- `Promise<State<TEntity>>`: 资源状态

#### relation.getResource(): Promise<Resource<TEntity>>

获取资源实例。

**返回值:**
- `Promise<Resource<TEntity>>`: 资源对象

#### relation.follow<K extends keyof TEntity['links']>(rel: K): ResourceRelation<TEntity['links'][K]>

根据关系类型 (rel) 跟踪资源关系。

**参数:**
- `rel`: 关系类型，必须是实体链接中定义的键之一

**返回值:**
- `ResourceRelation<TEntity['links'][K]>`: 关联资源的 ResourceRelation 对象

#### relation.withTemplateParameters(variables: LinkVariables): ResourceRelation<TEntity>

设置 URI 模板参数。

**参数:**
- `variables`: 要设置的模板参数变量

**返回值:**
- `ResourceRelation<TEntity>`: 当前资源关系对象（支持链式调用）

#### relation.withMethod(method: HttpMethod): ResourceRelation<TEntity>

设置 HTTP 请求方法。

**参数:**
- `method`: 要设置的 HTTP 方法

**返回值:**
- `ResourceRelation<TEntity>`: 当前资源关系对象（支持链式调用）

### State<TEntity extends Entity>

State 接口代表了资源的完整状态，包含数据、链接、集合和操作方法。

#### state.timestamp: number

状态首次生成的时间戳。

**示例:**
```typescript
console.log(`状态生成时间: ${new Date(userState.timestamp).toISOString()}`);
```

#### state.uri: string

与当前状态关联的 URI。

**示例:**
```typescript
console.log(`资源 URI: ${userState.uri}`);
```

#### state.data: TEntity['data']

资源数据。在 JSON 响应的情况下，这将是反序列化后的数据。

**示例:**
```typescript
// 访问用户数据
console.log(`用户名: ${userState.data.name}`);
console.log(`用户邮箱: ${userState.data.email}`);
```

#### state.collection: StateCollection<TEntity>

资源的集合状态。当实体是集合类型时，包含集合中每个元素的 State 对象数组；当实体不是集合类型时，返回空数组。支持分页集合的导航和状态管理。

**示例:**
```typescript
// 检查是否为集合
if (userState.collection.length > 0) {
  console.log(`集合包含 ${userState.collection.length} 个项目`);
  
  // 遍历集合中的每个项目
  userState.collection.forEach((itemState, index) => {
    console.log(`项目 ${index}:`, itemState.data);
  });
}
```

#### state.links: Links<TEntity['links']>

与资源关联的所有链接。

**示例:**
```typescript
// 获取所有链接
console.log('所有链接:', userState.links);

// 检查特定链接是否存在
if ('self' in userState.links) {
  console.log('自链接:', userState.links.self);
}
```

#### state.follow<K extends keyof TEntity['links']>(rel: K): Resource<TEntity['links'][K]>

根据关系类型 (rel) 跟踪资源关系。

**参数:**
- `rel`: 关系类型，必须是 TEntity['links'] 的键

**返回值:**
- `Resource<TEntity['links'][K]>`: 关联资源的 Resource 对象

**示例:**
```typescript
// 导航到用户的账户集合
const accountsResource = userState.follow('accounts');
const accountsState = await accountsResource.request();

// 导航到创建对话的模板
const createConversationResource = userState.follow('create-conversation');
```

#### state.serializeBody(): Buffer | Blob | string

返回可用于 HTTP 响应的状态序列化。

例如，JSON 对象可能简单地使用 JSON.serialize() 进行序列化。

**返回值:**
- `Buffer | Blob | string`: 序列化后的状态数据

**示例:**
```typescript
// 序列化状态用于 HTTP 响应
const serializedData = userState.serializeBody();

// 在服务器端，可以将序列化的数据发送给客户端
response.send(serializedData);
```

#### state.contentHeaders(): Headers

获取内容相关的 HTTP 头。内容头是 HTTP 头的一个子集，直接与内容相关。最明显的是 Content-Type。

这组头将由服务器随 GET 响应一起发送，但也会在 PUT 请求中发送回服务器。

**返回值:**
- `Headers`: 包含内容相关头的 Headers 对象

**示例:**
```typescript
// 获取内容头
const headers = userState.contentHeaders();

// 检查内容类型
console.log('Content-Type:', headers.get('Content-Type'));

// 在 PUT 请求中使用这些头
const response = await fetch(userState.uri, {
  method: 'PUT',
  headers: Object.fromEntries(userState.contentHeaders()),
  body: userState.serializeBody()
});
```

#### state.clone(): State<TEntity>

创建当前状态对象的深拷贝。

**返回值:**
- `State<TEntity>`: 克隆的状态对象

**示例:**
```typescript
// 克隆状态以进行修改而不影响原始状态
const clonedState = userState.clone();

// 可以安全地修改克隆的状态
clonedState.data.name = '新名称';

// 原始状态保持不变
console.log(userState.data.name); // 原始名称
console.log(clonedState.data.name); // 新名称
```

### StateFactory

StateFactory 负责接收 Fetch Response 并返回实现 State 接口的对象。

#### StateFactory.create<TEntity extends Entity>(client: ClientInstance, uri: string, response: Response, rel?: string): Promise<State<TEntity>>

创建一个新的 State 对象。

**参数:**
- `client`: 客户端实例
- `uri`: 资源 URI
- `response`: HTTP 响应对象
- `rel`: 关系名称（可选）

**返回值:**
- `Promise<State<TEntity>>`: 创建的状态对象

**示例:**
```typescript
// 通常不需要直接使用 StateFactory，库会在内部处理
// 但如果你需要自定义状态创建逻辑，可以实现自己的 StateFactory

const customStateFactory: StateFactory = {
  create: async <TEntity extends Entity>(
    client: ClientInstance,
    uri: string,
    response: Response,
    rel?: string
  ): Promise<State<TEntity>> => {
    // 自定义状态创建逻辑
    // ...
  }
};
```

### RequestOptions<T = any>

请求选项接口，用于配置 HTTP 请求。

**属性:**
- `data?: T`: 请求体数据
- `headers?: HttpHeaders | Headers`: HTTP 请求头
- `serializeBody?: () => string | Buffer | Blob`: 自定义序列化函数
- `getContentHeaders?: () => HttpHeaders | Headers`: 获取内容头的函数

### 内置中间件函数

#### acceptMiddleware(client: ClientInstance): FetchMiddleware

创建一个自动注入 Accept 头的中间件。

**参数:**
- `client`: 客户端实例

**功能:**
- 如果请求中没有 Accept 头，则根据客户端的 contentTypeMap 自动添加
- 支持内容类型优先级（q 值）

**示例:**
```typescript
// 自动生成的 Accept 头可能如下：
// "application/hal+json;q=1.0, application/json;q=0.8"
```

#### cacheMiddleware(client: ClientInstance): FetchMiddleware

创建一个管理缓存的中间件。

**参数:**
- `client`: 客户端实例

**功能:**
- 处理不安全 HTTP 方法（POST、PUT、DELETE）后的缓存失效
- 根据 Link 头的 rel=invalidates 使缓存失效
- 处理 Location 头导致的缓存失效
- 根据 Content-Location 头更新缓存
- 发出 'stale' 事件

**缓存失效条件:**
1. 执行不安全 HTTP 方法（POST、PUT、DELETE）
2. 响应包含 Link: rel=invalidates 头
3. 响应包含 Location 头
4. 请求方法为 DELETE

#### warningMiddleware(): FetchMiddleware

创建一个发出警告的中间件。

**功能:**
- 检查响应中的 Deprecation 头
- 检查响应中的 Sunset 头
- 检查 Link 头中的 rel=deprecation
- 在控制台输出警告信息

**警告格式:**
```
[Resource] The resource [URL] is deprecated. It will no longer respond [Sunset]. See [deprecation link] for more information.
```

### FetchMiddleware

中间件类型，用于拦截和修改 HTTP 请求。

**类型:**
```typescript
type FetchMiddleware = (
  request: Request,
  next: (request: Request) => Promise<Response>
) => Promise<Response>;
```

## 高级用法

### 自定义缓存策略

默认情况下，库使用 `ForeverCache`，它会永久缓存资源状态。你也可以使用 `ShortCache`，它会在指定时间后自动过期。

```typescript
import { createClient, ShortCache } from '@hateoas-ts/resource';
import { container } from '@hateoas-ts/resource/container';
import { TYPES } from '@hateoas-ts/resource/archtype/injection-types';

// 使用短期缓存（30秒过期）
const shortCache = new ShortCache(30000);
container.rebind(TYPES.Cache).toConstantValue(shortCache);

const client = createClient({ baseURL: 'https://api.example.com' });
```

### 中间件

你可以使用中间件来拦截和修改请求。中间件遵循标准的 Fetch API 模式，接收一个 Request 对象和一个 next 函数。

#### 内置中间件

库提供了几个内置中间件，可以自动处理常见的 HTTP 场景：

##### Accept 头中间件

`acceptMiddleware` 自动为请求添加合适的 `Accept` 头，基于客户端的内容类型映射。

```typescript
import { createClient, acceptMiddleware } from '@hateoas-ts/resource';

const client = createClient({ baseURL: 'https://api.example.com' });

// 客户端会自动使用此中间件，无需手动添加
// 它会根据客户端的 contentTypeMap 自动设置 Accept 头
// 例如: application/hal+json;q=1.0, application/json;q=0.8
```

##### 缓存中间件

`cacheMiddleware` 负责管理缓存，处理缓存失效和更新。

```typescript
import { createClient, cacheMiddleware } from '@hateoas-ts/resource';

const client = createClient({ baseURL: 'https://api.example.com' });

// 客户端会自动使用此中间件，无需手动添加
// 功能包括：
// 1. 处理不安全方法（POST、PUT、DELETE）后的缓存失效
// 2. 根据 Link: rel=invalidates 头使缓存失效
// 3. 处理 Location 头导致的缓存失效
// 4. 根据 Content-Location 头更新缓存
// 5. 发出 'stale' 事件
```

##### 警告中间件

`warningMiddleware` 监控响应中的警告信息，特别是资源弃用警告。

```typescript
import { createClient, warningMiddleware } from '@hateoas-ts/resource';

const client = createClient({ baseURL: 'https://api.example.com' });

// 客户端会自动使用此中间件，无需手动添加
// 它会检查以下头信息：
// 1. Deprecation: 指示资源已弃用
// 2. Sunset: 指示资源何时将不再可用
// 3. Link: rel=deprecation: 提供弃用信息的链接
// 当检测到弃用警告时，会在控制台输出警告信息
```

#### 自定义中间件

你可以创建自己的中间件来处理特定需求：

```typescript
import { createClient } from '@hateoas-ts/resource';

const client = createClient({ baseURL: 'https://api.example.com' });

// 添加认证中间件
client.use((request, next) => {
  // 修改请求头
  request.headers.set('Authorization', `Bearer ${token}`);
  
  // 调用下一个中间件或发送请求
  return next(request);
});

// 添加日志中间件
client.use((request, next) => {
  console.log(`请求: ${request.method} ${request.url}`);
  const start = Date.now();
  
  // 调用下一个中间件并获取响应
  return next(request).then(response => {
    console.log(`响应: ${response.status} (${Date.now() - start}ms)`);
    return response;
  });
});

// 修改请求体的中间件
client.use((request, next) => {
  if (request.method === 'POST' && request.headers.get('Content-Type') === 'application/json') {
    // 克隆请求以修改请求体
    const clonedRequest = request.clone();
    const body = clonedRequest.json().then(data => {
      // 添加时间戳
      data.timestamp = new Date().toISOString();
      return new Request(request, {
        body: JSON.stringify(data)
      });
    });
    
    return body.then(newRequest => next(newRequest));
  }
  
  return next(request);
});
```

**中间件类型:**
```typescript
type FetchMiddleware = (
  request: Request,
  next: (request: Request) => Promise<Response>
) => Promise<Response>;
```

**中间件执行顺序:**
- 中间件按照添加的顺序执行
- 每个中间件必须调用 `next()` 函数以传递请求到下一个中间件
- 最后一个中间件会发送实际的 HTTP 请求
- 响应会按照相反的顺序通过中间件链返回

**限制中间件作用域:**
```typescript
// 只对特定域名应用中间件
client.use(authMiddleware, 'https://api.example.com');

// 使用通配符匹配多个子域名
client.use(loggingMiddleware, 'https://*.example.com');

// 默认情况下，中间件应用于所有域名（'*'）
client.use(generalMiddleware); // 等同于 client.use(generalMiddleware, '*')
```

### 错误处理

库会抛出 HTTP 错误，你可以使用 try-catch 来处理它们。

```typescript
async function fetchUserWithErrorHandling(userId: string) {
  try {
    const userState = await client.go<User>(`/api/users/${userId}`).request(); // 默认 GET
    return userState;
  } catch (error) {
    if (error.status === 404) {
      console.log('用户不存在');
    } else if (error.status >= 500) {
      console.log('服务器错误');
    } else {
      console.log('其他错误:', error.message);
    }
    throw error;
  }
}
```

### 事件监听

Resource 对象是 EventEmitter，你可以监听各种事件。

#### 事件类型

Resource 支持以下三种事件类型：

1. **'update'**: 当从服务器接收到新的 State 时触发，包括通过 GET 请求或被嵌入的资源。调用 'PUT' 请求并使用完整状态对象时，以及调用 updateCache() 时也会触发。
2. **'stale'**: 当使用了不安全的 HTTP 方法（如 POST、PUT、PATCH 等）时触发。使用这些方法后，本地缓存会过期。
3. **'delete'**: 当使用 DELETE HTTP 方法时触发。

#### 事件监听方法

##### on(event, listener)

订阅事件，每次事件触发时都会调用监听器。

```typescript
const userResource = client.go<User>(`/api/users/${userId}`);

// 监听更新事件
userResource.on('update', (state) => {
  console.log('资源已更新:', state.data);
});

// 监听过期事件
userResource.on('stale', () => {
  console.log('资源已过期，需要刷新');
});

// 监听删除事件
userResource.on('delete', () => {
  console.log('资源已删除');
});
```

##### once(event, listener)

订阅事件，但只在第一次触发时调用监听器，之后自动取消订阅。

```typescript
// 只在第一次更新时触发
userResource.once('update', (state) => {
  console.log('首次更新:', state.data);
});

// 只在第一次过期时触发
userResource.once('stale', () => {
  console.log('首次过期');
});

// 只在第一次删除时触发
userResource.once('delete', () => {
  console.log('首次删除');
});
```

##### off(event, listener)

取消订阅特定事件的监听器。

```typescript
const updateListener = (state) => {
  console.log('资源已更新:', state.data);
};

// 添加监听器
userResource.on('update', updateListener);

// 移除监听器
userResource.off('update', updateListener);

// 移除过期事件监听器
userResource.off('stale', staleListener);

// 移除删除事件监听器
userResource.off('delete', deleteListener);
```

##### emit(event, ...args)

手动触发事件。

```typescript
// 手动触发更新事件
userResource.emit('update', someState);

// 手动触发过期事件
userResource.emit('stale');

// 手动触发删除事件
userResource.emit('delete');
```

#### 完整示例

```typescript
const userResource = client.go<User>(`/api/users/${userId}`);

// 添加多种事件监听器
const updateListener = (state) => console.log('资源已更新:', state.data);
const staleListener = () => console.log('资源已过期，需要刷新');
const deleteListener = () => console.log('资源已删除');

userResource.on('update', updateListener);
userResource.on('stale', staleListener);
userResource.on('delete', deleteListener);

// 添加一次性监听器
userResource.once('update', (state) => {
  console.log('这是第一次更新:', state.data);
});

// 发送请求，可能会触发事件
await userResource.request(); // 默认 GET

// 执行 PATCH 请求，会触发 stale 事件
await userResource.withMethod('PATCH').request({
  data: { name: '新名称' }
});

// 手动触发事件
userResource.emit('stale');

// 移除监听器
userResource.off('update', updateListener);
userResource.off('stale', staleListener);
userResource.off('delete', deleteListener);
```

### 处理分页

对于集合资源，你可以使用分页链接来导航。

```typescript
async function fetchAllUserConversations(userId: string) {
  let conversationsRelation = client.go<User>(`/api/users/${userId}`).follow('conversations');
  const allConversations = [];
  
  while (conversationsRelation) {
    // 默认使用 GET 方法获取分页数据
    const conversationsState = await conversationsRelation.request();
    allConversations.push(...conversationsState.collection);
    
    // 使用 follow 导航到下一页
    try {
      conversationsRelation = conversationsState.follow('next');
    } catch (error) {
      // 如果没有下一页链接，会抛出错误
      conversationsRelation = null;
    }
  }
  
  return allConversations;
}
```

## 缓存策略

### ForeverCache

`ForeverCache` 是默认的缓存实现，它会永久缓存资源状态，直到：

1. 执行了不安全的 HTTP 方法（POST、PUT、PATCH、DELETE）
2. 调用了 `clearCache()` 方法
3. 资源出现在 Location、Content-Location 或 "invalidates" 链接关系中

### ShortCache

`ShortCache` 继承自 `ForeverCache`，在指定时间后自动过期缓存项，默认为 30 秒。这对于需要定期刷新数据的场景很有用。

**特性:**
- 继承自 `ForeverCache`，具有所有基础缓存功能
- 支持自定义缓存超时时间（毫秒）
- 自动清理过期缓存项，避免内存泄漏
- 适用于频繁变化的数据

```typescript
import { ShortCache } from '@hateoas-ts/resource';

// 创建一个 5 分钟过期的缓存
const shortCache = new ShortCache(5 * 60 * 1000);

// 使用依赖注入容器配置缓存
import { container } from '@hateoas-ts/resource/container';
import { TYPES } from '@hateoas-ts/resource/archtype/injection-types';

container.rebind(TYPES.Cache).toConstantValue(shortCache);
```

**内部实现:**
- 使用 `setTimeout` 为每个缓存项设置过期时间
- 维护一个 `activeTimers` 映射来跟踪所有活动的定时器
- 在缓存项过期时自动删除
- 提供 `destroy()` 方法来清理所有定时器

### 自定义缓存

你也可以实现自己的缓存策略：

```typescript
import { Cache, State } from '@hateoas-ts/resource';

class CustomCache implements Cache {
  private cache = new Map<string, { state: State, expires: number }>();
  private ttl = 60000; // 1 分钟

  store(state: State) {
    this.cache.set(state.uri, {
      state: state.clone(),
      expires: Date.now() + this.ttl
    });
  }

  get(uri: string): State | null {
    const item = this.cache.get(uri);
    if (!item) return null;
    
    if (Date.now() > item.expires) {
      this.cache.delete(uri);
      return null;
    }
    
    return item.state.clone();
  }

  has(uri: string): boolean {
    const item = this.cache.get(uri);
    return item !== undefined && Date.now() <= item.expires;
  }

  delete(uri: string) {
    this.cache.delete(uri);
  }

  clear() {
    this.cache.clear();
  }
}
```

## 错误处理

### HTTP 错误

当 HTTP 请求失败时，库会抛出包含状态码和错误信息的错误对象。

```typescript
try {
  const userState = await client.go<User>(`/api/users/${userId}`).request(); // 默认 GET
} catch (error) {
  console.log(`错误状态码: ${error.status}`);
  console.log(`错误信息: ${error.message}`);
  console.log(`响应体: ${error.responseBody}`);
}
```

### 网络错误

网络错误（如无法连接到服务器）会被包装成标准的错误对象。

```typescript
try {
  const userState = await client.go<User>(`/api/users/${userId}`).request(); // 默认 GET
} catch (error) {
  if (error.name === 'TypeError' && error.message.includes('fetch')) {
    console.log('网络错误，请检查连接');
  }
}
```

### 验证错误

当提交表单数据时，如果数据不符合表单定义的验证规则，会抛出验证错误。

```typescript
try {
  const result = await userResource.follow('create-conversation').withMethod('POST').request({
    data: { title: '' } // 空标题可能不符合验证规则
  });
} catch (error) {
  if (error.message === 'Invalid') {
    console.log('表单验证失败');
  }
}
```

## 最佳实践

### 1. 类型安全

始终为你的资源定义类型，以获得完整的类型安全。

```typescript
type User = Entity<{ id: string; name: string; email: string }, { self: User }>;
```

### 2. 错误处理

始终使用 try-catch 来处理可能的错误。

```typescript
async function safeFetchUser(userId: string) {
  try {
    return await client.go<User>(`/api/users/${userId}`).request(); // 默认 GET
  } catch (error) {
    // 记录错误
    console.error('获取用户失败:', error);
    // 返回默认值或重新抛出
    return null;
  }
}
```

### 3. 缓存管理

根据你的应用需求选择合适的缓存策略。

```typescript
// 对于频繁变化的数据，使用短期缓存
const shortCache = new ShortCache(30000);

// 对于静态数据，使用永久缓存
const foreverCache = new ForeverCache();
```

### 4. 资源清理

在不再需要时，清理资源以避免内存泄漏。

```typescript
// 清除特定资源的缓存
userResource.clearCache();

// 清除所有缓存
client.clearCache();
```

### 5. 中间件使用

使用中间件来处理横切关注点，如认证、日志和错误处理。

```typescript
// 认证中间件
client.use((request, next) => {
  if (needsAuth(request.url)) {
    request.headers.set('Authorization', `Bearer ${getAuthToken()}`);
  }
  return next(request);
});

// 日志中间件
client.use((request, next) => {
  console.log(`[HTTP] ${request.method} ${request.url}`);
  const start = Date.now();
  
  return next(request).then(response => {
    console.log(`[HTTP] ${request.method} ${request.url} - ${response.status} (${Date.now() - start}ms)`);
    return response;
  });
});
```

## 常见问题解答

### Q: 如何处理认证？

A: 使用中间件来自动添加认证头。

```typescript
client.use((request, next) => {
  request.headers.set('Authorization', `Bearer ${token}`);
  return next(request);
});
```

### Q: 如何刷新缓存？

A: 调用 `clearCache()` 方法或执行不安全的 HTTP 方法。

```typescript
// 清除特定资源的缓存
userResource.clearCache();

// 清除所有缓存
client.clearCache();

// 执行 POST 请求会自动使相关缓存失效
await userResource.follow('update').withMethod('POST').request({
  data: { name: '新名称' }
});
```

### Q: 如何处理大文件上传？

A: 使用流或分块上传，并自定义序列化函数。

```typescript
const file = /* 获取文件对象 */;

await uploadResource.withMethod('POST').request({
  serializeBody: () => file,
  headers: {
    'Content-Type': file.type
  }
});
```

### Q: 如何取消请求？

A: 使用 AbortController。

```typescript
const controller = new AbortController();

const promise = userResource.request({
  signal: controller.signal
});

// 取消请求
controller.abort();
```

### Q: 如何处理并发请求？

A: 库会自动去重相同的请求，你不需要做特殊处理。

```typescript
// 这两个请求会被合并为一个（都使用默认的 GET 方法）
const promise1 = userResource.request();
const promise2 = userResource.request();

const [state1, state2] = await Promise.all([promise1, promise2]);
```

### Q: 如何调试请求？

A: 使用日志中间件或浏览器开发者工具。

```typescript
client.use((url, options) => {
  console.log('请求 URL:', url);
  console.log('请求选项:', options);
  return { url, options };
});
```

## 总结

`@hateoas-ts/resource` 库通过以下方式简化了与 HAL API 的交互：

- **类型安全**: TypeScript 类型确保了你在访问数据和关系时的正确性。
- **声明式导航**: 使用 `.follow()` 方法，你可以通过语义化的关系名称来导航，而不是硬编码 URL。
- **抽象复杂性**: 库处理了 HAL 响应的解析（`_links`, `_embedded`），为你提供了简洁的 `State` 对象。
- **流畅的 API**: 链式调用使得代码更具可读性和表达性。
- **灵活的缓存**: 多种缓存策略适应不同的应用场景。
- **事件驱动**: 通过事件监听，你可以响应资源状态的变化。

要开始使用，请确保你的 API 遵循 HAL 规范，然后按照上述示例定义你的实体类型并开始与 API 交互。

