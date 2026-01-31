package reengineering.ddd.teamai.api;

import jakarta.ws.rs.*;
import jakarta.ws.rs.container.ResourceContext;
import jakarta.ws.rs.core.Context;
import jakarta.ws.rs.core.MediaType;
import jakarta.ws.rs.core.Response;
import jakarta.ws.rs.core.UriInfo;
import org.springframework.hateoas.CollectionModel;
import reengineering.ddd.teamai.api.representation.ConversationModel;
import reengineering.ddd.teamai.description.ConversationDescription;
import reengineering.ddd.teamai.model.Conversation;
import reengineering.ddd.teamai.model.Project;
import reengineering.ddd.teamai.model.User;

public class ConversationsApi {
  @Context ResourceContext resourceContext;

  private final User user;
  private final Project project;

  public ConversationsApi(User user, Project project) {
    this.user = user;
    this.project = project;
  }

  @Path("{conversation-id}")
  public ConversationApi findById(@PathParam("conversation-id") String id) {
    return project
        .conversations()
        .findByIdentity(id)
        .map(
            conversation -> {
              ConversationApi conversationApi = new ConversationApi(user, project, conversation);
              return resourceContext.initResource(conversationApi);
            })
        .orElseThrow(() -> new WebApplicationException(Response.Status.NOT_FOUND));
  }

  @GET
  public CollectionModel<ConversationModel> findAll(
      @Context UriInfo uriInfo, @DefaultValue("0") @QueryParam("page") int page) {
    return new Pagination<>(project.conversations().findAll(), 40)
        .page(
            page,
            conversation -> new ConversationModel(user, project, conversation, uriInfo),
            p ->
                ApiTemplates.conversations(uriInfo)
                    .queryParam("page", p)
                    .build(user.getIdentity(), project.getIdentity()));
  }

  @POST
  @Consumes(MediaType.APPLICATION_JSON)
  public Response create(ConversationDescription description, @Context UriInfo uriInfo) {
    Conversation conversation = project.add(description);
    ConversationModel conversationModel =
        new ConversationModel(user, project, conversation, uriInfo);
    return Response.created(
            ApiTemplates.conversation(uriInfo)
                .build(user.getIdentity(), project.getIdentity(), conversation.getIdentity()))
        .entity(conversationModel)
        .build();
  }
}
