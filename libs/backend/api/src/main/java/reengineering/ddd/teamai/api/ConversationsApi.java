package reengineering.ddd.teamai.api;

import jakarta.validation.constraints.NotNull;
import jakarta.ws.rs.*;
import jakarta.ws.rs.container.ResourceContext;
import jakarta.ws.rs.core.Context;
import jakarta.ws.rs.core.MediaType;
import jakarta.ws.rs.core.Response;
import jakarta.ws.rs.core.UriInfo;
import org.springframework.cache.annotation.Cacheable;
import org.springframework.hateoas.CollectionModel;
import reengineering.ddd.teamai.api.representation.ConversationModel;
import reengineering.ddd.teamai.description.ConversationDescription;
import reengineering.ddd.teamai.model.Conversation;
import reengineering.ddd.teamai.model.User;

public class ConversationsApi {
  @Context
  ResourceContext resourceContext;

  private final User user;

  public ConversationsApi(User user) {
    this.user = user;
  }

  @Path("{conversation-id}")
  public ConversationApi findById(@PathParam("conversation-id") String id) {
    return user.conversations().findByIdentity(id).map(conversation -> {
        ConversationApi conversationApi = new ConversationApi(user, conversation);
        return resourceContext.initResource(conversationApi);
      })
      .orElseThrow(() -> new WebApplicationException(Response.Status.NOT_FOUND));
  }

  @GET
  public CollectionModel<ConversationModel> findAll(@Context UriInfo uriInfo, @DefaultValue("0") @QueryParam("page") int page) {
    return new Pagination<>(user.conversations().findAll(), 40).page(page,
      conversation -> new ConversationModel(user, conversation, uriInfo),
      p -> ApiTemplates.conversations(uriInfo).queryParam("page", p).build(user.getIdentity()));
  }

  @POST
  @Consumes(MediaType.APPLICATION_JSON)
  public Response create(CreateConversationRequestBody requestBody, @Context UriInfo uriInfo) {
    ConversationDescription description = new ConversationDescription(requestBody.getTitle());
    Conversation conversation = user.add(description);
    ConversationModel conversationModel = new ConversationModel(user, conversation, uriInfo);
    return Response.created(ApiTemplates.conversation(uriInfo).build(user.getIdentity(), conversation.getIdentity())).entity(conversationModel).build();
  }

  public static class CreateConversationRequestBody {
    @NotNull()
    private String title;

    public CreateConversationRequestBody() {
    }

    public String getTitle() {
      return title;
    }

    public void setTitle(String title) {
      this.title = title;
    }
  }
}

