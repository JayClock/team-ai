package reengineering.ddd.teamai.api;

import jakarta.inject.Inject;
import jakarta.ws.rs.Consumes;
import jakarta.ws.rs.GET;
import jakarta.ws.rs.POST;
import jakarta.ws.rs.QueryParam;
import jakarta.ws.rs.core.Context;
import jakarta.ws.rs.core.MediaType;
import jakarta.ws.rs.core.Response;
import jakarta.ws.rs.core.UriInfo;
import org.springframework.ai.chat.messages.UserMessage;
import org.springframework.ai.chat.model.ChatResponse;
import org.springframework.ai.chat.prompt.Prompt;
import org.springframework.ai.deepseek.DeepSeekChatModel;
import org.springframework.hateoas.Link;
import reactor.core.publisher.Flux;
import reengineering.ddd.teamai.api.representation.MessageModel;
import reengineering.ddd.teamai.description.MessageDescription;
import reengineering.ddd.teamai.model.Conversation;
import reengineering.ddd.teamai.model.Message;

public class MessagesApi {
  @Inject
  private DeepSeekChatModel chatModel;
  private final Conversation conversation;

  public MessagesApi(Conversation conversation) {
    this.conversation = conversation;
  }

  @POST
  @Consumes(MediaType.APPLICATION_JSON)
  public Response create(MessageDescription description, @Context UriInfo uriInfo) {
    Message message = this.conversation.add(description);
    MessageModel messageModel = new MessageModel(message);
    String apiResponseUri = uriInfo.getAbsolutePathBuilder().queryParam("since", message.getIdentity()).build().toString();
    messageModel.add(Link.of(apiResponseUri).withRel("ai-response"));
    return Response.created(uriInfo.getAbsolutePathBuilder().path(message.getIdentity()).build()).entity(messageModel).build();
  }

  @GET
  public Flux<ChatResponse> generateStream(@QueryParam("since") String since) {
    Message message = conversation.getMessages().findByIdentity(since).get();
    var prompt = new Prompt(new UserMessage(message.getDescription().content()));
    return chatModel.stream(prompt);
  }
}
