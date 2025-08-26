package reengineering.ddd.teamai.api;

import jakarta.ws.rs.GET;
import jakarta.ws.rs.Path;
import jakarta.ws.rs.container.ResourceContext;
import jakarta.ws.rs.core.Context;
import jakarta.ws.rs.core.UriInfo;
import reengineering.ddd.teamai.api.representation.ConversationModel;
import reengineering.ddd.teamai.model.Conversation;

public class ConversationApi {
  @Context
  private ResourceContext resourceContext;

  private final Conversation conversation;

  public ConversationApi(Conversation conversation) {
    this.conversation = conversation;
  }

  @GET
  public ConversationModel get(@Context UriInfo uriInfo) {
    return new ConversationModel(conversation, uriInfo.getAbsolutePathBuilder());
  }

  @Path("messages")
  public MessagesApi messages() {
    MessagesApi messagesApi = new MessagesApi(conversation);
    return resourceContext.initResource(messagesApi);
  }
}
