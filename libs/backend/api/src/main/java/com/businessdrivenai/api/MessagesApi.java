package com.businessdrivenai.api;

import com.businessdrivenai.api.representation.MessageModel;
import com.businessdrivenai.domain.model.Conversation;
import com.businessdrivenai.domain.model.Project;
import jakarta.ws.rs.GET;
import jakarta.ws.rs.core.Context;
import jakarta.ws.rs.core.UriInfo;
import org.springframework.hateoas.CollectionModel;

public class MessagesApi {
  private final Project project;
  private final Conversation conversation;

  public MessagesApi(Project project, Conversation conversation) {
    this.project = project;
    this.conversation = conversation;
  }

  @GET
  public CollectionModel<MessageModel> findAll(@Context UriInfo uriInfo) {
    var messages =
        conversation.messages().findAll().stream()
            .map(message -> new MessageModel(project, conversation, message, uriInfo))
            .toList();
    return CollectionModel.of(messages);
  }
}
