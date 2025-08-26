package reengineering.ddd.teamai.mybatis.associations;

import java.util.List;

import org.springframework.ai.chat.messages.UserMessage;
import org.springframework.ai.chat.prompt.Prompt;
import org.springframework.ai.deepseek.DeepSeekChatModel;

import jakarta.inject.Inject;
import reactor.core.publisher.Flux;
import reengineering.ddd.mybatis.database.EntityList;
import reengineering.ddd.mybatis.support.IdHolder;
import reengineering.ddd.teamai.description.MessageDescription;
import reengineering.ddd.teamai.model.Conversation;
import reengineering.ddd.teamai.model.Message;
import reengineering.ddd.teamai.mybatis.mappers.MessagesMapper;

public class ConversationMessages extends EntityList<String, Message> implements Conversation.Messages {
  private int conversationId;

  @Inject
  private MessagesMapper mapper;
  @Inject
  private DeepSeekChatModel deepSeekChatModel;

  @Override
  protected List<Message> findEntities(int from, int to) {
    return mapper.subMessagesByConversation(conversationId, from, to - from);
  }

  @Override
  protected Message findEntity(String id) {
    return mapper.findMessageByConversationAndId(conversationId, Integer.parseInt(id));
  }

  @Override
  public int size() {
    return this.mapper.countMessagesByConversation(conversationId);
  }

  @Override
  public Message saveMessage(MessageDescription description) {
    IdHolder idHolder = new IdHolder();
    mapper.insertMessage(idHolder, conversationId, description);
    return findEntity(String.valueOf(idHolder.id()));
  }

  @Override
  public Flux<String> sendMessage(MessageDescription description) {
    return deepSeekChatModel.stream(new Prompt(new UserMessage(description.content())))
        .map(response -> response.getResult().getOutput().getText());
  }
}
