package reengineering.ddd.teamai.mybatis.associations;

import jakarta.inject.Inject;
import reengineering.ddd.mybatis.database.EntityList;
import reengineering.ddd.mybatis.support.IdHolder;
import reengineering.ddd.teamai.description.MessageDescription;
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
}

