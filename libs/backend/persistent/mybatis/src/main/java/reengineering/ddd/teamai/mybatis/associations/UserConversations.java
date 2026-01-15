package reengineering.ddd.teamai.mybatis.associations;

import static reengineering.ddd.teamai.mybatis.config.CacheConfig.*;

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
import reengineering.ddd.teamai.mybatis.mappers.UserConversationsMapper;

public class UserConversations extends EntityList<String, Conversation>
    implements User.Conversations {
  private int userId;

  @Inject private UserConversationsMapper mapper;

  @Override
  @Cacheable(
      value = CACHE_USER_CONVERSATIONS_LIST,
      key = "#root.target.userId + ':' + #from + ':' + #to")
  protected List<Conversation> findEntities(int from, int to) {
    return mapper.findConversationsByUserId(userId, from, to - from);
  }

  @Override
  @Cacheable(
      value = CACHE_USER_CONVERSATIONS,
      key = "#root.target.userId + ':' + #id",
      unless = "#result == null")
  protected Conversation findEntity(String id) {
    return mapper.findConversationByUserAndId(userId, Integer.parseInt(id));
  }

  @Override
  @Cacheable(value = CACHE_USER_CONVERSATIONS_COUNT, key = "#root.target.userId")
  public int size() {
    return mapper.countConversationByUser(userId);
  }

  @Override
  @Caching(
      evict = {
        @CacheEvict(value = CACHE_USER_CONVERSATIONS_LIST, allEntries = true),
        @CacheEvict(value = CACHE_USER_CONVERSATIONS_COUNT, key = "#root.target.userId")
      })
  public Conversation add(ConversationDescription description) {
    IdHolder idHolder = new IdHolder();
    mapper.insertConversation(idHolder, userId, description);
    return findEntityDirect(String.valueOf(idHolder.id()));
  }

  @Override
  @Caching(
      evict = {
        @CacheEvict(value = CACHE_USER_CONVERSATIONS, key = "#root.target.userId + ':' + #id"),
        @CacheEvict(value = CACHE_USER_CONVERSATIONS_LIST, allEntries = true),
        @CacheEvict(value = CACHE_USER_CONVERSATIONS_COUNT, key = "#root.target.userId")
      })
  public void delete(String id) {
    mapper.deleteConversation(userId, Integer.parseInt(id));
  }

  /** Direct DB access for post-insert lookup (avoids caching incomplete data) */
  private Conversation findEntityDirect(String id) {
    return mapper.findConversationByUserAndId(userId, Integer.parseInt(id));
  }

  /** Getter for SpEL access to userId */
  public int getUserId() {
    return userId;
  }
}
