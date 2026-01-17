---
name: smart-domain-api
description: |
  API layer patterns for Smart Domain DDD. Use when:
  (1) Creating HATEOAS Level 3 REST APIs with Zero-Copy Wrappers
  (2) Adding links, affordances, and embedded resources
  (3) Implementing JAX-RS sub-resource patterns
---

# API Layer Patterns

## TDD Workflow

**IMPORTANT**: Always follow Test-First approach:

1. **Generate test code first** - Create API integration tests for endpoints
2. **Wait for user confirmation** - User reviews and approves the test design
3. **Generate implementation code** - Only after test approval, implement the API
4. **Verify tests pass** - Run tests to confirm implementation correctness

## HATEOAS Level 3 Implementation

### RepresentationModel Base Class

All API models extend Spring HATEOAS `RepresentationModel`:

```java
@Relation(collectionRelation = "conversations")
public class ConversationModel extends RepresentationModel<ConversationModel> {
  @JsonProperty private String id;
  @JsonUnwrapped private ConversationDescription description;

  public ConversationModel(User user, Conversation conversation, UriInfo uriInfo) {
    this.id = conversation.getIdentity();
    this.description = conversation.getDescription();
    // Add links...
  }
}
```

### Zero-Copy Wrapper Pattern

API models hold entity references directly:

```java
public ConversationModel(User user, Conversation conversation, UriInfo uriInfo) {
  this.id = conversation.getIdentity();           // Direct reference
  this.description = conversation.getDescription(); // Direct reference - no copying
}
```

## Link Generation

### ApiTemplates Class

Centralized URL building:

```java
public class ApiTemplates {
  public static UriBuilder user(UriInfo uriInfo) {
    return uriInfo.getBaseUriBuilder()
      .path(UsersApi.class)
      .path(UsersApi.class, "findById");
  }

  public static UriBuilder conversations(UriInfo uriInfo) {
    return user(uriInfo).path(UserApi.class, "conversations");
  }

  public static UriBuilder conversation(UriInfo uriInfo) {
    return conversations(uriInfo).path(ConversationsApi.class, "findById");
  }
}
```

### Adding Links to Models

```java
// Self link with affordances
Link selfLink = Link.of(
  ApiTemplates.conversation(uriInfo)
    .build(user.getIdentity(), conversation.getIdentity())
    .getPath()
).withSelfRel();

add(Affordances.of(selfLink)
  .afford(HttpMethod.PUT).withInput(Conversation.ConversationChange.class)
  .andAfford(HttpMethod.DELETE).withName("delete-conversation")
  .toLink());

// Related resource links
Link messagesLink = Link.of(
  ApiTemplates.messages(uriInfo)
    .build(user.getIdentity(), conversation.getIdentity())
    .getPath()
).withRel("messages");

add(messagesLink);
```

## Affordances

Affordances describe available actions on a resource:

```java
add(Affordances.of(selfLink)
  .afford(HttpMethod.PUT)
    .withInput(Conversation.ConversationChange.class)
  .andAfford(HttpMethod.DELETE)
    .withName("delete-conversation")
  .toLink());
```

Generated JSON:

```json
{
  "_links": {
    "self": { "href": "/api/users/1/conversations/42" }
  },
  "_templates": {
    "default": {
      "method": "PUT",
      "properties": [{ "name": "title", "type": "text" }]
    },
    "delete-conversation": { "method": "DELETE" }
  }
}
```

## JAX-RS Resource Structure

### Sub-Resource Pattern

```java
public class UserApi {
  @Context ResourceContext resourceContext;
  private final User user;

  @Path("conversations")
  public ConversationsApi conversations() {
    ConversationsApi api = new ConversationsApi(user);
    return resourceContext.initResource(api);
  }
}

public class ConversationsApi {
  private final User user;

  @Path("{conversation-id}")
  public ConversationApi findById(@PathParam("conversation-id") String id) {
    return user.conversations()
      .findByIdentity(id)
      .map(conv -> resourceContext.initResource(new ConversationApi(user, conv)))
      .orElseThrow(() -> new WebApplicationException(Response.Status.NOT_FOUND));
  }
}
```

### Collection Endpoints

```java
@GET
public CollectionModel<ConversationModel> findAll(
    @Context UriInfo uriInfo,
    @DefaultValue("0") @QueryParam("page") int page) {
  return new Pagination<>(user.conversations().findAll(), 40)
    .page(page,
      conv -> new ConversationModel(user, conv, uriInfo),
      p -> ApiTemplates.conversations(uriInfo)
        .queryParam("page", p)
        .build(user.getIdentity()));
}
```

### Create Endpoints

```java
@POST
@Consumes(MediaType.APPLICATION_JSON)
public Response create(Conversation.ConversationChange request, @Context UriInfo uriInfo) {
  ConversationDescription desc = new ConversationDescription(request.getTitle());
  Conversation conversation = user.add(desc);

  return Response.created(
    ApiTemplates.conversation(uriInfo)
      .build(user.getIdentity(), conversation.getIdentity()))
    .entity(new ConversationModel(user, conversation, uriInfo))
    .build();
}
```

## Pagination

### Pagination Helper

```java
new Pagination<>(collection, pageSize)
  .page(pageNumber,
    entity -> new EntityModel(...),  // Mapper
    p -> uriBuilder.queryParam("page", p).build(...)); // Link builder
```

### Response Format

```json
{
  "_embedded": {
    "conversations": [
      { "id": "1", "title": "First" },
      { "id": "2", "title": "Second" }
    ]
  },
  "_links": {
    "self": { "href": "/api/users/1/conversations?page=0" },
    "next": { "href": "/api/users/1/conversations?page=1" }
  }
}
```

## Embedded Resources

Include related resources in response:

```java
public class UserModel extends RepresentationModel<UserModel> {
  @JsonProperty("_embedded")
  private EmbeddedResources embedded;

  public UserModel(User user, UriInfo uriInfo) {
    List<AccountModel> accounts = user.accounts().findAll().stream()
      .map(acc -> new AccountModel(user, acc, uriInfo))
      .toList();
    this.embedded = new EmbeddedResources(accounts);
  }

  public record EmbeddedResources(
    @JsonProperty("accounts") List<AccountModel> accounts
  ) {}
}
```

## Quick Reference

| Task                | Location                                                                      |
| ------------------- | ----------------------------------------------------------------------------- |
| API representations | `libs/backend/api/src/main/java/reengineering/ddd/teamai/api/representation/` |
| API resources       | `libs/backend/api/src/main/java/reengineering/ddd/teamai/api/`                |
