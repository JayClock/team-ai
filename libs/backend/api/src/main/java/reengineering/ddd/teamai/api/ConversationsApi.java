package reengineering.ddd.teamai.api;

import jakarta.ws.rs.*;
import jakarta.ws.rs.core.*;
import org.springframework.hateoas.CollectionModel;
import reengineering.ddd.teamai.api.representation.ConversationModel;
import reengineering.ddd.teamai.description.ConversationDescription;
import reengineering.ddd.teamai.model.Conversation;
import reengineering.ddd.teamai.model.User;

public class ConversationsApi {
  private final User user;

  public ConversationsApi(User user) {
    this.user = user;
  }

  @GET
  @Path("{conversation-id}")
  public ConversationModel findById(@PathParam("conversation-id") String id, @Context UriInfo uriInfo) {
    UriBuilder builder = uriInfo.getAbsolutePathBuilder();
    return user.conversations().findByIdentity(id).map(conversation -> new ConversationModel(conversation, builder))
      .orElseThrow(() -> new WebApplicationException(Response.Status.NOT_FOUND));
  }

  @GET
  public CollectionModel<ConversationModel> findAll(@Context UriInfo uriInfo, @DefaultValue("0") @QueryParam("page") int page) {
    return new Pagination<>(user.conversations().findAll(), 40).page(page,
      conversation -> new ConversationModel(conversation, uriInfo.getAbsolutePathBuilder().path(ConversationsApi.class, "findById")),
      p -> uriInfo.getAbsolutePathBuilder().queryParam("page", p).build(user.getIdentity()));
  }

  @POST
  @Consumes(MediaType.APPLICATION_JSON)
  public Response create(ConversationDescription description, @Context UriInfo uriInfo) {
    Conversation conversation = user.add(description);
    return Response.created(uriInfo.getAbsolutePathBuilder().path(conversation.getIdentity()).build()).build();
  }
}
