package com.businessdrivenai.api.representation;

import com.businessdrivenai.api.ApiTemplates;
import com.businessdrivenai.api.ConversationApi;
import com.businessdrivenai.domain.description.ConversationDescription;
import com.businessdrivenai.domain.description.MessageDescription;
import com.businessdrivenai.domain.model.Conversation;
import com.businessdrivenai.domain.model.Project;
import com.fasterxml.jackson.annotation.JsonProperty;
import com.fasterxml.jackson.annotation.JsonUnwrapped;
import jakarta.ws.rs.core.UriInfo;
import org.springframework.hateoas.Link;
import org.springframework.hateoas.RepresentationModel;
import org.springframework.hateoas.mediatype.Affordances;
import org.springframework.hateoas.server.core.Relation;
import org.springframework.http.HttpMethod;

@Relation(collectionRelation = "conversations")
public class ConversationModel extends RepresentationModel<ConversationModel> {
  @JsonProperty private String id;
  @JsonUnwrapped private ConversationDescription description;
  @JsonProperty private String projectId;

  public ConversationModel(Project project, Conversation conversation, UriInfo uriInfo) {
    this.id = conversation.getIdentity();
    this.description = conversation.getDescription();
    this.projectId = project.getIdentity();

    add(
        Affordances.of(
                Link.of(
                        ApiTemplates.conversation(uriInfo)
                            .build(project.getIdentity(), conversation.getIdentity())
                            .getPath())
                    .withSelfRel())
            .afford(HttpMethod.PUT)
            .withInput(Conversation.ConversationChange.class)
            .andAfford(HttpMethod.DELETE)
            .withName("delete-conversation")
            .toLink());
    add(
        Affordances.of(
                Link.of(
                        ApiTemplates.conversation(uriInfo)
                            .path(ConversationApi.class, "chat")
                            .build(project.getIdentity(), conversation.getIdentity())
                            .getPath())
                    .withRel("chat"))
            .afford(HttpMethod.POST)
            .withInput(MessageDescription.class)
            .withName("chat")
            .toLink());

    add(
        Link.of(
                ApiTemplates.messages(uriInfo)
                    .build(project.getIdentity(), conversation.getIdentity())
                    .getPath())
            .withRel("messages"));
  }
}
