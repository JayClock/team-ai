# @hateoas-ts/resource

<a alt="Nx logo" href="https://nx.dev" target="_blank" rel="noreferrer"><img src="https://raw.githubusercontent.com/nrwl/nx/master/images/nx-logo.png" width="45"></a>

**Language**: [English](https://github.com/JayClock/team-ai/blob/main/packages/resource/README.md) | [中文](https://github.com/JayClock/team-ai/blob/main/packages/resource/README_ZH.md)

`@hateoas-ts/resource` is a powerful TypeScript/JavaScript client library for interacting with REST APIs that follow the HAL (Hypertext Application Language) specification. It provides type-safe resource navigation, relationship tracking, and state management.

## 📚 Recommended Reading Order

To better understand the HATEOAS client implementation, it's recommended to read the documentation in the following order:

1. [Smart Domain DDD Architecture](../../libs/backend/README.md) - Complete architecture design documentation to understand the core design principles
2. **This Documentation** - TypeScript/JavaScript client library documentation
3. [REST Principles and Agentic UI](../../public/REST_Principles_Agentic_UI.pdf) - Detailed explanation of REST architecture principles and intelligent UI design

## 🗺️ Roadmap

### Version 1.2.1 (Current)

- [x] Basic HAL resource navigation
- [x] Type-safe entity definitions
- [x] Cache management
- [x] Event system
- [x] Middleware support

### Version 1.3 (Planned)

- [ ] Comprehensive form field validation
- [x] React integration utilities (see [`@hateoas-ts/resource-react`](../resource-react/README.md))
- [ ] Debugging tool support

### Version 1.4 (Planned)

- [ ] Angular integration utilities
- [ ] More cache strategy options
- [ ] Automatic retry mechanism
- [ ] Request cancellation optimization

## Installation

```bash
npm install @hateoas-ts/resource
# or
yarn add @hateoas-ts/resource
# or
pnpm add @hateoas-ts/resource
```

## Core Concepts

The library is built around several core concepts:

- **Entity**: Defines the resource's description (data) and relationships (links).
- **Client**: Entry point for interacting with the API base URL.
- **Resource**: Represents a specific API endpoint.
- **State**: Contains resource data, links, collections, and operation methods.
- **Cache**: Used for caching resource states to improve performance.

## Basic Usage

### 1. Define Entity Types

First, use the `Entity` and `Collection` types to define your data models.

```typescript
import { Entity, Collection } from '@hateoas-ts/resource';

// Define Account entity
export type Account = Entity<{ id: string; provider: string; providerId: string }, { self: Account }>;

// Define Conversation entity
export type Conversation = Entity<{ id: string; title: string }, { self: Conversation }>;

// Define User entity with relationships to other entities
export type User = Entity<
  { id: string; name: string; email: string },
  {
    self: User;
    accounts: Collection<Account>; // User has multiple accounts
    conversations: Collection<Conversation>; // User has multiple conversations
    'create-conversation': Conversation; // Template relationship for creating new conversations
    'latest-conversation': Conversation; // Relationship to get the latest conversation
  }
>;
```

### 2. Initialize Client

Create a `Client` instance pointing to your API base URL.

```typescript
import { createClient } from '@hateoas-ts/resource';

const client = createClient({ baseURL: 'https://api.example.com' });
```

### 3. Fetch and Use Resources

Get a root resource through the `client.go()` method, then call `.request()` to get its state. By default, chained calls use the GET method, which aligns with RESTful discovery conventions.

```typescript
async function fetchUser(userId: string) {
  // Create a Resource object pointing to a specific user resource
  const userResource = client.go<User>(`/api/users/${userId}`);

  // Use GET method by default to get the resource's state (including data, links, etc.)
  const userState = await userResource.request();

  // Access resource data
  console.log(`User name: ${userState.data.name}`);
  console.log(`Email: ${userState.data.email}`);

  return userState;
}

fetchUser('user-123');
```

If you need to explicitly specify the method, you can use `withMethod()`:

```typescript
// Explicitly specify GET method
const userState = await userResource.withMethod('GET').request();
```

### 4. Navigate Resources Through Relationships

Use the `.follow()` method to navigate to related resources without manually building URLs. The `follow()` method returns a `ResourceRelation` object that can continue chained calls or be directly requested.

```typescript
async function navigateToUserConversations(userId: string) {
  const userResource = client.go<User>(`/api/users/${userId}`);
  const userState = await userResource.request(); // Default GET

  // Create a ResourceRelation object pointing to the user's 'conversations' relationship
  const conversationsRelation = userState.follow('conversations');

  // Call the relationship to get the state of the conversations collection (default GET)
  const conversationsState = await conversationsRelation.request();

  // Iterate through the collection and print each conversation's title
  if (Array.isArray(conversationsState.collection)) {
    conversationsState.collection.forEach((conversationState) => {
      console.log(`Conversation title: ${conversationState.data.title}`);
    });
  }
}

navigateToUserConversations('user-123');
```

### 5. Chained Navigation

You can continuously call `.follow()` for deep navigation. Each `follow()` call returns a new `ResourceRelation` object, supporting chained calls.

```typescript
async function getFirstConversationOfFirstAccount(userId: string) {
  const userState = await client.go<User>(`/api/users/${userId}`).request(); // Default GET

  // Chained navigation: user -> accounts collection -> first account -> self relationship
  // All navigation steps use GET method by default
  const firstAccountState = await userState.follow('accounts').follow('self').request();

  console.log(`First account provider: ${firstAccountState.data.provider}`);

  // Assume the account also has a conversations relationship
  // const accountConversations = await firstAccountState.follow('conversations').request(); // Default GET
}

getFirstConversationOfFirstAccount('user-123');
```

### 6. Using Specific Operation Relationships

Relationships can represent specific operations, not just data collections.

```typescript
async function createNewConversationForUser(userId: string) {
  const userState = await client.go<User>(`/api/users/${userId}`).request(); // Default GET

  // Navigate to the 'create-conversation' relationship
  const createConversationRelation = userState.follow('create-conversation');

  // Use withMethod to specify POST method, then submit form data to create a new conversation
  const newConversationState = await createConversationRelation.withMethod('POST').request({
    data: { title: 'New conversation' }
  });

  console.log(`ID of the newly created conversation: ${newConversationState.data.id}`);
}

createNewConversationForUser('user-123');
```

### 7. Using Typed Request Methods

The library provides typed methods for common HTTP operations, which offer better type safety and IDE support:

```typescript
// GET request
const userState = await userResource.withGet().request({
  headers: { 'Accept': 'application/json' }
});

// POST request
const newState = await userResource.follow('create-conversation')
  .withPost()
  .request({ data: { title: 'New conversation' } });

// PUT request - fully replace resource
const updatedState = await userResource.follow('self')
  .withPut()
  .request({ data: { name: 'Updated Name', email: 'updated@example.com' } });

// PATCH request - partially update resource
const patchedState = await userResource.follow('self')
  .withPatch()
  .request({ data: { name: 'Patched Name' } });

// DELETE request
await userResource.follow('self').withDelete().request();
```

These typed methods also provide access to form definitions:

```typescript
// Get form definition for a PUT request
const putForm = await userResource.withPut().getForm();
if (putForm) {
  console.log('Form fields:', putForm.fields);
  console.log('Form URI:', putForm.uri);
}
```

## API Reference

### createClient(options: Config): Client

Create a new client instance.

**Parameters:**
- `options`: Configuration object
  - `baseURL`: API base URL
  - `sendUserAgent`: Whether to send User-Agent header (optional)

**Return value:**
- `Client`: Client instance

### Client

#### client.go<TEntity extends Entity>(link?: string | NewLink): Resource<TEntity>

Create a Resource object pointing to a specific resource.

**Parameters:**
- `link`: Resource link (optional)
  - If a string, it's a path relative to baseURL
  - If a NewLink object, it contains more detailed link information

**Return value:**
- `Resource<TEntity>`: Resource object

#### client.use(middleware: FetchMiddleware, origin?: string): void

Add a fetch middleware for each fetch() call.

**Parameters:**
- `middleware`: Middleware function
- `origin`: Origin where the middleware applies (optional, default is '*')

### Resource<TEntity extends Entity>

#### resource.fetch(init?: RequestInit): Promise<Response>

Execute an HTTP request on the current resource URI.

**Parameters:**
- `init`: RequestInit object (optional) for configuring the request

**Return value:**
- `Promise<Response>`: HTTP response object

**Example:**
```typescript
// Simple GET request
const response = await resource.fetch();

// Request with custom headers
const response = await resource.fetch({
  headers: { 'Authorization': 'Bearer token' }
});

// POST request
const response = await resource.fetch({
  method: 'POST',
  body: JSON.stringify({ name: 'New name' }),
  headers: { 'Content-Type': 'application/json' }
});
```

#### resource.fetchOrThrow(init?: RequestInit): Promise<Response>

Execute an HTTP request on the current resource URI. If the response has a 4XX or 5XX status code, this function will throw an exception.

**Parameters:**
- `init`: RequestInit object (optional) for configuring the request

**Return value:**
- `Promise<Response>`: HTTP response object

**Example:**
```typescript
try {
  const response = await resource.fetchOrThrow();
  console.log('Request successful:', response.status);
} catch (error) {
  console.error('Request failed:', error.status, error.message);
}
```

#### resource.request(options?: RequestOptions, form?: Form): Promise<State<TEntity>>

Send an HTTP request and get the current state of the resource. Uses GET method by default, which aligns with RESTful discovery conventions.

**Parameters:**
- `options`: Request options (optional)
  - `data`: Request body data
  - `headers`: Request headers
  - `query`: Query parameters
  - `serializeBody`: Custom serialization function
  - `getContentHeaders`: Function to get content headers
- `form`: Form object (optional)

**Return value:**
- `Promise<State<TEntity>>`: Resource state

**Example:**
```typescript
// Default GET request, aligns with RESTful discovery convention
const state = await resource.request();

// Explicitly specify GET method
const getState = await resource.withMethod('GET').request();

// POST request (requires explicit method specification)
const newState = await resource.withMethod('POST').request({
  data: { name: 'New name' }
});
```

#### resource.updateCache(state: State<TEntity>): void

Update the state cache and trigger events. This updates the local state but does not update the server.

**Parameters:**
- `state`: State object to cache

**Exception:**
- Will throw an error if the URI of the state object does not match the resource's URI

**Example:**
```typescript
const newState = /* Get new state */;
resource.updateCache(newState);
```

#### resource.clearCache(): void

Clear the cache of the current resource.

**Example:**
```typescript
resource.clearCache();
```

#### resource.getCache(): State<TEntity> | null

Retrieve the currently cached resource state, returns null if unavailable.

**Return value:**
- `State<TEntity> | null`: Cached state object or null

**Example:**
```typescript
const cachedState = resource.getCache();
if (cachedState) {
  console.log('Get data from cache:', cachedState.data);
} else {
  console.log('No data in cache');
}
```

#### resource.follow<K extends keyof TEntity['links']>(rel: K): ResourceRelation<TEntity['links'][K]>

Follows a resource relationship based on its rel type.

**Parameters:**
- `rel`: The relationship type, must be a key defined in the entity links

**Return value:**
- `ResourceRelation<TEntity['links'][K]>`: ResourceRelation object of the related resource

#### resource.withMethod(method: HttpMethod): Resource<TEntity>

Set the HTTP method. For non-GET requests, this method must be called before calling `request()`.

**Parameters:**
- `method`: HTTP method ('GET', 'POST', 'PUT', 'PATCH', 'DELETE', etc.)

**Return value:**
- `Resource<TEntity>`: Current resource object (supports chained calls)

**Description:**
- By default, `request()` uses the GET method, which aligns with RESTful discovery conventions
- For non-safe methods like POST, PUT, PATCH, DELETE, you must use `withMethod()` to specify explicitly

**Example:**
```typescript
// Default GET request (no need to specify method)
const getState = await resource.request();

// Explicitly specify GET method
const explicitGetState = await resource.withMethod('GET').request();

// Set POST method (must specify)
const postState = await resource.withMethod('POST').request({
  data: { title: 'New title' }
});

// Chained calls
const result = await resource
  .withMethod('PUT')
  .withTemplateParameters({ id: '123' })
  .request({ data: { name: 'Updated name' } });
```

#### resource.withTemplateParameters(variables: LinkVariables): Resource<TEntity>

Sets URI template parameters.

**Parameters:**
- `variables`: The template parameter variables to set

**Return value:**
- `Resource<TEntity>`: Current resource object (supports chained calls)

**Example:**
```typescript
// Set template parameters
const resource = client.go<User>('/api/users/{userId}')
  .withTemplateParameters({ userId: '123' });

// Use withMethod in chain
const state = await resource
  .withTemplateParameters({ userId: '123' })
  .withMethod('GET')
  .request();
```

#### resource.withGet(): { request: (options?: GetRequestOptions) => Promise<State<TEntity>> }

Prepare a GET request to the resource.

**Return value:**
- Object containing:
  - `request`: Function to execute the GET request with optional options

**Example:**
```typescript
const state = await resource.withGet().request({
  headers: { 'Accept': 'application/json' }
});
```

#### resource.withPost(): { request: (options: PostRequestOptions) => Promise<State>, getForm: () => Promise<Form | undefined> }

Prepare a POST request to the resource.

**Return value:**
- Object containing:
  - `request`: Function to execute the POST request with options
  - `getForm`: Function to get the form definition for POST requests

**Example:**
```typescript
const newState = await resource.withPost().request({
  data: { title: 'New conversation' }
});

// Get form definition
const form = await resource.withPost().getForm();
```

#### resource.withPut(): { request: (options: PutRequestOptions) => Promise<State<TEntity>>, getForm: () => Promise<Form | undefined> }

Prepare a PUT request to the resource. PUT requests fully replace the resource state.

**Return value:**
- Object containing:
  - `request`: Function to execute the PUT request with options
  - `getForm`: Function to get the form definition for PUT requests

**Example:**
```typescript
const updatedState = await resource.withPut().request({
  data: { name: 'Updated Name', email: 'updated@example.com' }
});

// Get form definition
const form = await resource.withPut().getForm();
```

#### resource.withPatch(): { request: (options: PatchRequestOptions) => Promise<State<TEntity>>, getForm: () => Promise<Form | undefined> }

Prepare a PATCH request to the resource. PATCH requests partially update the resource state.

**Return value:**
- Object containing:
  - `request`: Function to execute the PATCH request with options
  - `getForm`: Function to get the form definition for PATCH requests

**Example:**
```typescript
const patchedState = await resource.withPatch().request({
  data: { name: 'Patched Name' }
});

// Get form definition
const form = await resource.withPatch().getForm();
```

#### resource.withDelete(): { request: () => Promise<State<TEntity>> }

Prepare a DELETE request to the resource.

**Return value:**
- Object containing:
  - `request`: Function to execute the DELETE request

**Example:**
```typescript
await resource.withDelete().request();
```

### ResourceRelation<TEntity extends Entity>

ResourceRelation class is used to handle navigation of resource relationships, supporting chained calls and parameter setting.

#### relation.request(requestOptions?: RequestOptions): Promise<State<TEntity>>

Executes a resource request to get the resource state.

**Parameters:**
- `requestOptions`: Request options (optional)

**Return value:**
- `Promise<State<TEntity>>`: Resource state

#### relation.getResource(): Promise<Resource<TEntity>>

Gets the resource instance.

**Return value:**
- `Promise<Resource<TEntity>>`: Resource object

#### relation.follow<K extends keyof TEntity['links']>(rel: K): ResourceRelation<TEntity['links'][K]>

Follows a resource relationship based on its rel type.

**Parameters:**
- `rel`: The relationship type, must be a key defined in the entity links

**Return value:**
- `ResourceRelation<TEntity['links'][K]>`: ResourceRelation object of the related resource

#### relation.withTemplateParameters(variables: LinkVariables): ResourceRelation<TEntity>

Sets URI template parameters.

**Parameters:**
- `variables`: The template parameter variables to set

**Return value:**
- `ResourceRelation<TEntity>`: Current resource relation object (supports chained calls)

#### relation.withMethod(method: HttpMethod): ResourceRelation<TEntity>

Set the HTTP method.

**Parameters:**
- `method`: HTTP method

**Return value:**
- `ResourceRelation<TEntity>`: Current resource relation object (supports chained calls)

### State<TEntity extends Entity>

The State interface represents the complete state of a resource, including data, links, collections, and operation methods.

#### state.timestamp: number

Timestamp when the state was first generated.

**Example:**
```typescript
console.log(`State generation time: ${new Date(userState.timestamp).toISOString()}`);
```

#### state.uri: string

The URI associated with the current state.

**Example:**
```typescript
console.log(`Resource URI: ${userState.uri}`);
```

#### state.data: TEntity['data']

Resource data. In the case of a JSON response, this will be the deserialized data.

**Example:**
```typescript
// Access user data
console.log(`User name: ${userState.data.name}`);
console.log(`User email: ${userState.data.email}`);
```

#### state.collection: StateCollection<TEntity>

The collection state of the resource. When the entity is a collection type, it contains an array of State objects for each element in the collection; when the entity is not a collection type, it returns an empty array. Supports navigation and state management of paginated collections.

**Example:**
```typescript
// Check if it's a collection
if (userState.collection.length > 0) {
  console.log(`Collection contains ${userState.collection.length} items`);
  
  // Iterate through each item in the collection
  userState.collection.forEach((itemState, index) => {
    console.log(`Item ${index}:`, itemState.data);
  });
}
```

#### state.links: Links<TEntity['links']>

All links associated with the resource.

**Example:**
```typescript
// Get all links
console.log('All links:', userState.links);

// Check if a specific link exists
if ('self' in userState.links) {
  console.log('Self link:', userState.links.self);
}
```

#### state.follow<K extends keyof TEntity['links']>(rel: K): Resource<TEntity['links'][K]>

Follows a resource relationship based on its rel type.

**Parameters:**
- `rel`: The relationship type, must be a key of TEntity['links']

**Return value:**
- `Resource<TEntity['links'][K]>`: Resource object of the related resource

**Example:**
```typescript
// Navigate to the user's accounts collection
const accountsResource = userState.follow('accounts');
const accountsState = await accountsResource.request();

// Navigate to the create conversation template
const createConversationResource = userState.follow('create-conversation');
```

#### state.serializeBody(): Buffer | Blob | string

Return a state serialization that can be used for HTTP responses.

For example, a JSON object might simply be serialized using JSON.serialize().

**Return value:**
- `Buffer | Blob | string`: Serialized state data

**Example:**
```typescript
// Serialize state for HTTP response
const serializedData = userState.serializeBody();

// On the server side, you can send the serialized data to the client
response.send(serializedData);
```

#### state.contentHeaders(): Headers

Get content-related HTTP headers. Content headers are a subset of HTTP headers directly related to content. The most obvious one is Content-Type.

This set of headers will be sent by the server with the GET response, but will also be sent back to the server in PUT requests.

**Return value:**
- `Headers`: Headers object containing content-related headers

**Example:**
```typescript
// Get content headers
const headers = userState.contentHeaders();

// Check content type
console.log('Content-Type:', headers.get('Content-Type'));

// Use these headers in a PUT request
const response = await fetch(userState.uri, {
  method: 'PUT',
  headers: Object.fromEntries(userState.contentHeaders()),
  body: userState.serializeBody()
});
```

#### state.clone(): State<TEntity>

Create a deep copy of the current state object.

**Return value:**
- `State<TEntity>`: Cloned state object

**Example:**
```typescript
// Clone the state for modification without affecting the original state
const clonedState = userState.clone();

// Can safely modify the cloned state
clonedState.data.name = 'New name';

// Original state remains unchanged
console.log(userState.data.name); // Original name
console.log(clonedState.data.name); // New name
```

### StateFactory

StateFactory is responsible for receiving a Fetch Response and returning an object that implements the State interface.

#### StateFactory.create<TEntity extends Entity>(client: ClientInstance, uri: string, response: Response, rel?: string): Promise<State<TEntity>>

Create a new State object.

**Parameters:**
- `client`: Client instance
- `uri`: Resource URI
- `response`: HTTP response object
- `rel`: Relationship name (optional)

**Return value:**
- `Promise<State<TEntity>>`: Created state object

**Example:**
```typescript
// Usually you don't need to use StateFactory directly, the library handles it internally
// But if you need custom state creation logic, you can implement your own StateFactory

const customStateFactory: StateFactory = {
  create: async <TEntity extends Entity>(
    client: ClientInstance,
    uri: string,
    response: Response,
    rel?: string
  ): Promise<State<TEntity>> => {
    // Custom state creation logic
    // ...
  }
};
```

### RequestOptions<T = any>

Request options interface for configuring HTTP requests.

**Properties:**
- `data?: T`: Request body data
- `headers?: HttpHeaders | Headers`: HTTP request headers
- `serializeBody?: () => string | Buffer | Blob`: Custom serialization function
- `getContentHeaders?: () => HttpHeaders | Headers`: Function to get content headers

### Built-in Middleware Functions

#### acceptMiddleware(client: ClientInstance): FetchMiddleware

Create a middleware that automatically injects Accept headers.

**Parameters:**
- `client`: Client instance

**Features:**
- If the request doesn't have an Accept header, it automatically adds one based on the client's contentTypeMap
- Supports content type priority (q values)

**Example:**
```typescript
// The automatically generated Accept header might look like this:
// "application/hal+json;q=1.0, application/json;q=0.8"
```

#### cacheMiddleware(client: ClientInstance): FetchMiddleware

Create a middleware that manages caching.

**Parameters:**
- `client`: Client instance

**Features:**
- Handle cache invalidation after unsafe HTTP methods (POST, PUT, DELETE)
- Invalidate cache based on Link header's rel=invalidates
- Handle cache invalidation caused by Location header
- Update cache based on Content-Location header
- Emit 'stale' events

**Cache invalidation conditions:**
1. Execute unsafe HTTP methods (POST, PUT, DELETE)
2. Response contains Link: rel=invalidates header
3. Response contains Location header
4. Request method is DELETE

#### warningMiddleware(): FetchMiddleware

Create a middleware that issues warnings.

**Features:**
- Check for Deprecation header in responses
- Check for Sunset header in responses
- Check for rel=deprecation in Link headers
- Output warning information to the console

**Warning format:**
```
[Resource] The resource [URL] is deprecated. It will no longer respond [Sunset]. See [deprecation link] for more information.
```

### FetchMiddleware

Middleware type for intercepting and modifying HTTP requests.

**Type:**
```typescript
type FetchMiddleware = (
  request: Request,
  next: (request: Request) => Promise<Response>
) => Promise<Response>;
```

## Advanced Usage

### Custom Cache Strategies

By default, the library uses `ForeverCache`, which permanently caches resource states. You can also use `ShortCache`, which automatically expires after a specified time.

```typescript
import { createClient, ShortCache } from '@hateoas-ts/resource';
import { container } from '@hateoas-ts/resource/container';
import { TYPES } from '@hateoas-ts/resource/archtype/injection-types';

// Use short-term cache (expires in 30 seconds)
const shortCache = new ShortCache(30000);
container.rebind(TYPES.Cache).toConstantValue(shortCache);

const client = createClient({ baseURL: 'https://api.example.com' });
```

### Middleware

You can use middleware to intercept and modify requests. Middleware follows the standard Fetch API pattern, receiving a Request object and a next function.

#### Built-in Middleware

The library provides several built-in middleware that can automatically handle common HTTP scenarios:

##### Accept Header Middleware

`acceptMiddleware` automatically adds appropriate `Accept` headers to requests based on the client's content type mapping.

```typescript
import { createClient, acceptMiddleware } from '@hateoas-ts/resource';

const client = createClient({ baseURL: 'https://api.example.com' });

// The client will automatically use this middleware, no need to add it manually
// It will automatically set Accept headers based on the client's contentTypeMap
// For example: application/hal+json;q=1.0, application/json;q=0.8
```

##### Cache Middleware

`cacheMiddleware` is responsible for managing cache, handling cache invalidation and updates.

```typescript
import { createClient, cacheMiddleware } from '@hateoas-ts/resource';

const client = createClient({ baseURL: 'https://api.example.com' });

// The client will automatically use this middleware, no need to add it manually
// Features include:
// 1. Handle cache invalidation after unsafe methods (POST, PUT, DELETE)
// 2. Invalidate cache based on Link: rel=invalidates header
// 3. Handle cache invalidation caused by Location header
// 4. Update cache based on Content-Location header
// 5. Emit 'stale' events
```

##### Warning Middleware

`warningMiddleware` monitors warning information in responses, especially resource deprecation warnings.

```typescript
import { createClient, warningMiddleware } from '@hateoas-ts/resource';

const client = createClient({ baseURL: 'https://api.example.com' });

// The client will automatically use this middleware, no need to add it manually
// It checks the following header information:
// 1. Deprecation: Indicates the resource is deprecated
// 2. Sunset: Indicates when the resource will no longer be available
// 3. Link: rel=deprecation: Provides a link to deprecation information
// When deprecation warnings are detected, it outputs warning information to the console
```

#### Custom Middleware

You can create your own middleware to handle specific needs:

```typescript
import { createClient } from '@hateoas-ts/resource';

const client = createClient({ baseURL: 'https://api.example.com' });

// Add authentication middleware
client.use((request, next) => {
  // Modify request headers
  request.headers.set('Authorization', `Bearer ${token}`);
  
  // Call the next middleware or send the request
  return next(request);
});

// Add logging middleware
client.use((request, next) => {
  console.log(`Request: ${request.method} ${request.url}`);
  const start = Date.now();
  
  // Call the next middleware and get the response
  return next(request).then(response => {
    console.log(`Response: ${response.status} (${Date.now() - start}ms)`);
    return response;
  });
});

// Middleware to modify request body
client.use((request, next) => {
  if (request.method === 'POST' && request.headers.get('Content-Type') === 'application/json') {
    // Clone the request to modify the request body
    const clonedRequest = request.clone();
    const body = clonedRequest.json().then(data => {
      // Add timestamp
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

**Middleware type:**
```typescript
type FetchMiddleware = (
  request: Request,
  next: (request: Request) => Promise<Response>
) => Promise<Response>;
```

**Middleware execution order:**
- Middleware is executed in the order they are added
- Each middleware must call the `next()` function to pass the request to the next middleware
- The last middleware will send the actual HTTP request
- Responses are returned through the middleware chain in reverse order

**Limiting middleware scope:**
```typescript
// Apply middleware only to specific domains
client.use(authMiddleware, 'https://api.example.com');

// Use wildcards to match multiple subdomains
client.use(loggingMiddleware, 'https://*.example.com');

// By default, middleware applies to all domains ('*')
client.use(generalMiddleware); // Equivalent to client.use(generalMiddleware, '*')
```

### Error Handling

The library will throw HTTP errors, and you can use try-catch to handle them.

```typescript
async function fetchUserWithErrorHandling(userId: string) {
  try {
    const userState = await client.go<User>(`/api/users/${userId}`).request(); // Default GET
    return userState;
  } catch (error) {
    if (error.status === 404) {
      console.log('User does not exist');
    } else if (error.status >= 500) {
      console.log('Server error');
    } else {
      console.log('Other error:', error.message);
    }
    throw error;
  }
}
```

### Event Listening

Resource objects are EventEmitter, and you can listen to various events.

#### Event Types

Resource supports the following three event types:

1. **'update'**: Triggered when a new State is received from the server, including through GET requests or embedded resources. Also triggered when calling 'PUT' request with a complete state object and when calling updateCache().
2. **'stale'**: Triggered when unsafe HTTP methods (such as POST, PUT, PATCH, etc.) are used. After using these methods, the local cache expires.
3. **'delete'**: Triggered when using the DELETE HTTP method.

#### Event Listening Methods

##### on(event, listener)

Subscribe to an event, the listener is called each time the event is triggered.

```typescript
const userResource = client.go<User>(`/api/users/${userId}`);

// Listen for update events
userResource.on('update', (state) => {
  console.log('Resource updated:', state.data);
});

// Listen for stale events
userResource.on('stale', () => {
  console.log('Resource is stale, needs refresh');
});

// Listen for delete events
userResource.on('delete', () => {
  console.log('Resource deleted');
});
```

##### once(event, listener)

Subscribe to an event, but the listener is called only on the first trigger, then automatically unsubscribed.

```typescript
// Trigger only on the first update
userResource.once('update', (state) => {
  console.log('First update:', state.data);
});

// Trigger only on the first stale event
userResource.once('stale', () => {
  console.log('First stale event');
});

// Trigger only on the first delete event
userResource.once('delete', () => {
  console.log('First delete event');
});
```

##### off(event, listener)

Unsubscribe from specific event listeners.

```typescript
const updateListener = (state) => {
  console.log('Resource updated:', state.data);
};

// Add listener
userResource.on('update', updateListener);

// Remove listener
userResource.off('update', updateListener);

// Remove stale event listener
userResource.off('stale', staleListener);

// Remove delete event listener
userResource.off('delete', deleteListener);
```

##### emit(event, ...args)

Manually trigger events.

```typescript
// Manually trigger update event
userResource.emit('update', someState);

// Manually trigger stale event
userResource.emit('stale');

// Manually trigger delete event
userResource.emit('delete');
```

#### Complete Example

```typescript
const userResource = client.go<User>(`/api/users/${userId}`);

// Add multiple event listeners
const updateListener = (state) => console.log('Resource updated:', state.data);
const staleListener = () => console.log('Resource is stale, needs refresh');
const deleteListener = () => console.log('Resource deleted');

userResource.on('update', updateListener);
userResource.on('stale', staleListener);
userResource.on('delete', deleteListener);

// Add one-time listener
userResource.once('update', (state) => {
  console.log('This is the first update:', state.data);
});

// Send request, might trigger events
await userResource.request(); // Default GET

// Execute PATCH request, will trigger stale event
await userResource.withMethod('PATCH').request({
  data: { name: 'New name' }
});

// Manually trigger events
userResource.emit('stale');

// Remove listeners
userResource.off('update', updateListener);
userResource.off('stale', staleListener);
userResource.off('delete', deleteListener);
```

### Handling Pagination

For collection resources, you can use pagination links to navigate.

```typescript
async function fetchAllUserConversations(userId: string) {
  let conversationsRelation = client.go<User>(`/api/users/${userId}`).follow('conversations');
  const allConversations = [];
  
  while (conversationsRelation) {
    // Use GET method by default to get paginated data
    const conversationsState = await conversationsRelation.request();
    allConversations.push(...conversationsState.collection);
    
    // Use follow to navigate to the next page
    try {
      conversationsRelation = conversationsState.follow('next');
    } catch (error) {
      // If there's no next page link, an error will be thrown
      conversationsRelation = null;
    }
  }
  
  return allConversations;
}
```

## Cache Strategies

### ForeverCache

`ForeverCache` is the default cache implementation that permanently caches resource states until:

1. Unsafe HTTP methods (POST, PUT, PATCH, DELETE) are executed
2. The `clearCache()` method is called
3. The resource appears in Location, Content-Location, or "invalidates" link relationships

### ShortCache

`ShortCache` inherits from `ForeverCache` and automatically expires cache items after a specified time, defaulting to 30 seconds. This is useful for scenarios that require regular data refresh.

**Features:**
- Inherits from `ForeverCache`, has all basic cache functionality
- Supports custom cache timeout (milliseconds)
- Automatically cleans up expired cache items to avoid memory leaks
- Suitable for frequently changing data

```typescript
import { ShortCache } from '@hateoas-ts/resource';

// Create a cache that expires in 5 minutes
const shortCache = new ShortCache(5 * 60 * 1000);

// Use dependency injection container to configure cache
import { container } from '@hateoas-ts/resource/container';
import { TYPES } from '@hateoas-ts/resource/archtype/injection-types';

container.rebind(TYPES.Cache).toConstantValue(shortCache);
```

**Internal implementation:**
- Uses `setTimeout` to set expiration time for each cache item
- Maintains an `activeTimers` map to track all active timers
- Automatically deletes cache items when they expire
- Provides a `destroy()` method to clean up all timers

### Custom Cache

You can also implement your own cache strategy:

```typescript
import { Cache, State } from '@hateoas-ts/resource';

class CustomCache implements Cache {
  private cache = new Map<string, { state: State, expires: number }>();
  private ttl = 60000; // 1 minute

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

## Error Handling

### HTTP Errors

When HTTP requests fail, the library will throw an error object containing status codes and error messages.

```typescript
try {
  const userState = await client.go<User>(`/api/users/${userId}`).request(); // Default GET
} catch (error) {
  console.log(`Error status code: ${error.status}`);
  console.log(`Error message: ${error.message}`);
  console.log(`Response body: ${error.responseBody}`);
}
```

### Network Errors

Network errors (such as inability to connect to the server) will be wrapped into standard error objects.

```typescript
try {
  const userState = await client.go<User>(`/api/users/${userId}`).request(); // Default GET
} catch (error) {
  if (error.name === 'TypeError' && error.message.includes('fetch')) {
    console.log('Network error, please check your connection');
  }
}
```

### Validation Errors

When submitting form data, if the data does not meet the validation rules defined by the form, a validation error will be thrown.

```typescript
try {
  const result = await userResource.follow('create-conversation').withMethod('POST').request({
    data: { title: '' } // Empty title might not meet validation rules
  });
} catch (error) {
  if (error.message === 'Invalid') {
    console.log('Form validation failed');
  }
}
```

## Best Practices

### 1. Type Safety

Always define types for your resources to get full type safety.

```typescript
type User = Entity<{ id: string; name: string; email: string }, { self: User }>;
```

### 2. Error Handling

Always use try-catch to handle possible errors.

```typescript
async function safeFetchUser(userId: string) {
  try {
    return await client.go<User>(`/api/users/${userId}`).request(); // Default GET
  } catch (error) {
    // Log error
    console.error('Failed to fetch user:', error);
    // Return default value or rethrow
    return null;
  }
}
```

### 3. Cache Management

Choose appropriate cache strategies based on your application needs.

```typescript
// For frequently changing data, use short-term cache
const shortCache = new ShortCache(30000);

// For static data, use permanent cache
const foreverCache = new ForeverCache();
```

### 4. Resource Cleanup

Clean up resources when they are no longer needed to avoid memory leaks.

```typescript
// Clear cache for specific resources
userResource.clearCache();

// Clear all cache
client.clearCache();
```

### 5. Middleware Usage

Use middleware to handle cross-cutting concerns such as authentication, logging, and error handling.

```typescript
// Authentication middleware
client.use((request, next) => {
  if (needsAuth(request.url)) {
    request.headers.set('Authorization', `Bearer ${getAuthToken()}`);
  }
  return next(request);
});

// Logging middleware
client.use((request, next) => {
  console.log(`[HTTP] ${request.method} ${request.url}`);
  const start = Date.now();
  
  return next(request).then(response => {
    console.log(`[HTTP] ${request.method} ${request.url} - ${response.status} (${Date.now() - start}ms)`);
    return response;
  });
});
```

## Frequently Asked Questions

### Q: How to handle authentication?

A: Use middleware to automatically add authentication headers.

```typescript
client.use((request, next) => {
  request.headers.set('Authorization', `Bearer ${token}`);
  return next(request);
});
```

### Q: How to refresh cache?

A: Call the `clearCache()` method or execute unsafe HTTP methods.

```typescript
// Clear cache for specific resources
userResource.clearCache();

// Clear all cache
client.clearCache();

// Executing POST requests will automatically invalidate related cache
await userResource.follow('update').withMethod('POST').request({
  data: { name: 'New name' }
});
```

### Q: How to handle large file uploads?

A: Use streaming or chunked uploads and customize serialization functions.

```typescript
const file = /* Get file object */;

await uploadResource.withMethod('POST').request({
  serializeBody: () => file,
  headers: {
    'Content-Type': file.type
  }
});
```

### Q: How to cancel requests?

A: Use AbortController.

```typescript
const controller = new AbortController();

const promise = userResource.request({
  signal: controller.signal
});

// Cancel request
controller.abort();
```

### Q: How to handle concurrent requests?

A: The library will automatically deduplicate identical requests, you don't need special handling.

```typescript
// These two requests will be merged into one (both use the default GET method)
const promise1 = userResource.request();
const promise2 = userResource.request();

const [state1, state2] = await Promise.all([promise1, promise2]);
```

### Q: How to debug requests?

A: Use logging middleware or browser developer tools.

```typescript
client.use((url, options) => {
  console.log('Request URL:', url);
  console.log('Request options:', options);
  return { url, options };
});
```

## Framework Integrations

### React Integration

For React applications, we provide a dedicated integration package that offers React hooks and components:

**[@hateoas-ts/resource-react](../resource-react/README.md)**

The React integration package provides:

- **ResourceProvider**: Context provider for injecting the HATEOAS client
- **useClient**: Hook to access the client instance
- **useInfiniteCollection**: Hook for handling infinite scroll/pagination of collection resources
- **useResolveResource**: Internal hook for resolving resource-like objects

**Installation:**
```bash
npm install @hateoas-ts/resource-react
# or
yarn add @hateoas-ts/resource-react
# or
pnpm add @hateoas-ts/resource-react
```

**Quick Example:**
```tsx
import { createClient } from '@hateoas-ts/resource';
import { ResourceProvider, useInfiniteCollection } from '@hateoas-ts/resource-react';

const client = createClient({ baseURL: 'https://api.example.com' });

function App() {
  return (
    <ResourceProvider client={client}>
      <YourComponents />
    </ResourceProvider>
  );
}

function ConversationsList() {
  const client = useClient();
  const userResource = client.go<User>('/api/users/123');

  const {
    items,
    loading,
    hasNextPage,
    loadNextPage
  } = useInfiniteCollection(userResource.follow('conversations'));

  return (
    <div>
      {items.map(conv => (
        <div key={conv.data.id}>{conv.data.title}</div>
      ))}
      {hasNextPage && (
        <button onClick={loadNextPage} disabled={loading}>
          Load More
        </button>
      )}
    </div>
  );
}
```

For complete React documentation, see the [`@hateoas-ts/resource-react` README](../resource-react/README.md).

## Summary

The `@hateoas-ts/resource` library simplifies interaction with HAL APIs in the following ways:

- **Type Safety**: TypeScript types ensure correctness when accessing data and relationships.
- **Declarative Navigation**: Using the `.follow()` method, you can navigate through semantic relationship names instead of hardcoding URLs.
- **Abstract Complexity**: The library handles parsing of HAL responses (`_links`, `_embedded`), providing you with clean `State` objects.
- **Fluent API**: Chained calls make code more readable and expressive.
- **Flexible Caching**: Multiple cache strategies adapt to different application scenarios.
- **Event-Driven**: Through event listening, you can respond to changes in resource state.

To get started, ensure your API follows the HAL specification, then define your entity types according to the examples above and start interacting with the API.

