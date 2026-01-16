package reengineering.ddd.teamai.mybatis.associations;

import jakarta.inject.Inject;
import java.util.List;
import org.springframework.cache.annotation.CacheEvict;
import org.springframework.cache.annotation.Cacheable;
import org.springframework.cache.annotation.Caching;
import reengineering.ddd.mybatis.database.EntityList;
import reengineering.ddd.mybatis.support.IdHolder;
import reengineering.ddd.teamai.description.ConversationDescription;
import reengineering.ddd.teamai.model.Conversation;
import reengineering.ddd.teamai.model.User;
import reengineering.ddd.teamai.mybatis.cache.AssociationMapping;
import reengineering.ddd.teamai.mybatis.mappers.UserConversationsMapper;

@AssociationMapping(entity = User.class, field = "conversations", parentIdField = "userId")
public class UserConversations extends EntityList<String, Conversation>
    implements User.Conversations {

  private static final String CACHE_NAME = "userConversations";
  private static final String CACHE_LIST = "userConversationsList";
  private static final String CACHE_COUNT = "userConversationsCount";

  private int userId;

  @Inject private UserConversationsMapper mapper;

  @Override
  @Cacheable(value = CACHE_LIST, key = "#root.target.userId + ':' + #from + ':' + #to")
  protected List<Conversation> findEntities(int from, int to) {
    return mapper.findConversationsByUserId(userId, from, to - from);
  }

  @Override
  @Cacheable(
      value = CACHE_NAME,
      key = "#root.target.userId + ':' + #id",
      unless = "#result == null")
  protected Conversation findEntity(String id) {
    return mapper.findConversationByUserAndId(userId, Integer.parseInt(id));
  }

  @Override
  @Cacheable(value = CACHE_COUNT, key = "#root.target.userId")
  public int size() {
    return mapper.countConversationByUser(userId);
  }

  @Override
  @Caching(
      evict = {
        @CacheEvict(value = CACHE_LIST, allEntries = true),
        @CacheEvict(value = CACHE_COUNT, key = "#root.target.userId")
      })
  public Conversation add(ConversationDescription description) {
    IdHolder idHolder = new IdHolder();
    mapper.insertConversation(idHolder, userId, description);
    return findEntity(String.valueOf(idHolder.id()));
  }

  @Override
  @Caching(
      evict = {
        @CacheEvict(value = CACHE_NAME, key = "#root.target.userId + ':' + #id"),
        @CacheEvict(value = CACHE_LIST, allEntries = true),
        @CacheEvict(value = CACHE_COUNT, key = "#root.target.userId")
      })
  public void delete(String id) {
    mapper.deleteConversation(userId, Integer.parseInt(id));
  }
}
