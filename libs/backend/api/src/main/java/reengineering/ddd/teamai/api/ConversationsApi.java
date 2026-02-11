package reengineering.ddd.teamai.api;

import jakarta.validation.Valid;
import jakarta.validation.constraints.NotNull;
import jakarta.ws.rs.Consumes;
import jakarta.ws.rs.DefaultValue;
import jakarta.ws.rs.GET;
import jakarta.ws.rs.POST;
import jakarta.ws.rs.Path;
import jakarta.ws.rs.PathParam;
import jakarta.ws.rs.QueryParam;
import jakarta.ws.rs.WebApplicationException;
import jakarta.ws.rs.container.ResourceContext;
import jakarta.ws.rs.core.Context;
import jakarta.ws.rs.core.MediaType;
import jakarta.ws.rs.core.Response;
import jakarta.ws.rs.core.UriInfo;
import lombok.Data;
import lombok.NoArgsConstructor;
import org.springframework.hateoas.CollectionModel;
import reengineering.ddd.teamai.api.representation.ConversationModel;
import reengineering.ddd.teamai.description.ConversationDescription;
import reengineering.ddd.teamai.model.Conversation;
import reengineering.ddd.teamai.model.Project;

public class ConversationsApi {
  @Context ResourceContext resourceContext;

  private final Project project;

  public ConversationsApi(Project project) {
    this.project = project;
  }

  @Path("{conversation-id}")
  public ConversationApi findById(@PathParam("conversation-id") String id) {
    return project
        .conversations()
        .findByIdentity(id)
        .map(
            conversation -> {
              ConversationApi conversationApi = new ConversationApi(project, conversation);
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
            conversation -> new ConversationModel(project, conversation, uriInfo),
            p ->
                ApiTemplates.conversations(uriInfo)
                    .queryParam("page", p)
                    .build(project.getIdentity()));
  }

  @POST
  @Consumes(MediaType.APPLICATION_JSON)
  public Response create(@Valid CreateConversationRequest request, @Context UriInfo uriInfo) {
    ConversationDescription description = new ConversationDescription(request.title);
    Conversation conversation = project.add(description);
    ConversationModel conversationModel = new ConversationModel(project, conversation, uriInfo);
    return Response.created(
            ApiTemplates.conversation(uriInfo)
                .build(project.getIdentity(), conversation.getIdentity()))
        .entity(conversationModel)
        .build();
  }

  @Data
  @NoArgsConstructor
  public static class CreateConversationRequest {
    @NotNull() private String title;
  }
}
