package reengineering.ddd.teamai.mybatis.associations;

import jakarta.inject.Inject;
import reengineering.ddd.mybatis.database.EntityList;
import reengineering.ddd.teamai.model.Conversation;
import reengineering.ddd.teamai.model.Message;
import reengineering.ddd.teamai.mybatis.mappers.MessagesMapper;

import java.util.List;

public class ConversationMessages extends EntityList<String, Message> implements Conversation.Messages {
  private int conversationId;

  @Inject
  private MessagesMapper mapper;

  @Override
  protected List<Message> findEntities(int from, int to) {
    return List.of();
  }

  @Override
  protected Message findEntity(String id) {
    return mapper.findMessageByConversationAndId(conversationId, Integer.parseInt(id));
  }

  @Override
  public int size() {
    return this.mapper.countMessagesByConversation(conversationId);
  }
}
