package com.businessdrivenai.api.representation;

import com.businessdrivenai.api.ApiTemplates;
import com.businessdrivenai.domain.description.MessageDescription;
import com.businessdrivenai.domain.model.Conversation;
import com.businessdrivenai.domain.model.Message;
import com.businessdrivenai.domain.model.Project;
import com.fasterxml.jackson.annotation.JsonProperty;
import com.fasterxml.jackson.annotation.JsonUnwrapped;
import jakarta.ws.rs.core.UriInfo;
import org.springframework.hateoas.Link;
import org.springframework.hateoas.RepresentationModel;
import org.springframework.hateoas.server.core.Relation;

@Relation(collectionRelation = "messages")
public class MessageModel extends RepresentationModel<MessageModel> {
  @JsonProperty private String id;
  @JsonUnwrapped private MessageDescription description;

  public MessageModel(
      Project project, Conversation conversation, Message message, UriInfo uriInfo) {
    this.id = message.getIdentity();
    this.description = message.getDescription();
    add(
        Link.of(
                ApiTemplates.message(uriInfo)
                    .build(project.getIdentity(), conversation.getIdentity(), message.getIdentity())
                    .getPath())
            .withSelfRel());
  }
}
