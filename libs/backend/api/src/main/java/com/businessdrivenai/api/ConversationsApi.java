package com.businessdrivenai.api;

import com.businessdrivenai.api.representation.ConversationModel;
import com.businessdrivenai.domain.description.ConversationDescription;
import com.businessdrivenai.domain.model.Conversation;
import com.businessdrivenai.domain.model.Project;
import jakarta.ws.rs.*;
import jakarta.ws.rs.container.ResourceContext;
import jakarta.ws.rs.core.Context;
import jakarta.ws.rs.core.MediaType;
import jakarta.ws.rs.core.Response;
import jakarta.ws.rs.core.UriInfo;
import org.springframework.hateoas.CollectionModel;

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
  public Response create(ConversationDescription description, @Context UriInfo uriInfo) {
    Conversation conversation = project.add(description);
    ConversationModel conversationModel = new ConversationModel(project, conversation, uriInfo);
    return Response.created(
            ApiTemplates.conversation(uriInfo)
                .build(project.getIdentity(), conversation.getIdentity()))
        .entity(conversationModel)
        .build();
  }
}
