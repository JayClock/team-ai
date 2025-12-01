package reengineering.ddd.teamai.mybatis.associations;

import jakarta.inject.Inject;
import reengineering.ddd.mybatis.database.EntityList;
import reengineering.ddd.mybatis.support.IdHolder;
import reengineering.ddd.teamai.description.ConversationDescription;
import reengineering.ddd.teamai.model.Conversation;
import reengineering.ddd.teamai.model.User;
import reengineering.ddd.teamai.mybatis.mappers.ConversationsMapper;

import java.util.List;

public class UserConversations extends EntityList<String, Conversation> implements User.Conversations {
  private int userId;

  @Inject
  private ConversationsMapper mapper;

  @Override
  protected List<Conversation> findEntities(int from, int to) {
    return mapper.findConversationsByUserId(userId, from, to - from);
  }

  @Override
  protected Conversation findEntity(String id) {
    return mapper.findConversationByUserAndId(userId, Integer.parseInt(id));
  }

  @Override
  public int size() {
    return mapper.countConversationByUser(userId);
  }

  @Override
  public Conversation add(ConversationDescription description) {
    IdHolder idHolder = new IdHolder();
    mapper.insertConversation(idHolder, userId, description);
    return findEntity(String.valueOf(idHolder.id()));
  }
}
