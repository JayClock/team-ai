package reengineering.ddd.teamai.mybatis.associations;

import static reengineering.ddd.teamai.mybatis.config.CacheConfig.*;

import jakarta.inject.Inject;
import java.util.List;
import org.springframework.cache.annotation.CacheEvict;
import org.springframework.cache.annotation.Cacheable;
import org.springframework.cache.annotation.Caching;
import reengineering.ddd.mybatis.database.EntityList;
import reengineering.ddd.mybatis.support.IdHolder;
import reengineering.ddd.teamai.description.MessageDescription;
import reengineering.ddd.teamai.model.Conversation;
import reengineering.ddd.teamai.model.Message;
import reengineering.ddd.teamai.mybatis.mappers.ConversationMessagesMapper;

public class ConversationMessages extends EntityList<String, Message>
    implements Conversation.Messages {
  private int conversationId;

  @Inject private ConversationMessagesMapper mapper;

  @Override
  @Cacheable(
      value = CACHE_CONVERSATION_MESSAGES_LIST,
      key = "#root.target.conversationId + ':' + #from + ':' + #to")
  protected List<Message> findEntities(int from, int to) {
    return mapper.subMessagesByConversation(conversationId, from, to - from);
  }

  @Override
  @Cacheable(
      value = CACHE_CONVERSATION_MESSAGES,
      key = "#root.target.conversationId + ':' + #id",
      unless = "#result == null")
  protected Message findEntity(String id) {
    return mapper.findMessageByConversationAndId(conversationId, Integer.parseInt(id));
  }

  @Override
  @Cacheable(value = CACHE_CONVERSATION_MESSAGES_COUNT, key = "#root.target.conversationId")
  public int size() {
    return this.mapper.countMessagesByConversation(conversationId);
  }

  @Override
  @Caching(
      evict = {
        @CacheEvict(value = CACHE_CONVERSATION_MESSAGES_LIST, allEntries = true),
        @CacheEvict(value = CACHE_CONVERSATION_MESSAGES_COUNT, key = "#root.target.conversationId")
      })
  public Message saveMessage(MessageDescription description) {
    IdHolder idHolder = new IdHolder();
    mapper.insertMessage(idHolder, conversationId, description);
    return findEntityDirect(String.valueOf(idHolder.id()));
  }

  /** Direct DB access for post-insert lookup (avoids caching incomplete data) */
  private Message findEntityDirect(String id) {
    return mapper.findMessageByConversationAndId(conversationId, Integer.parseInt(id));
  }

  /** Getter for SpEL access to conversationId */
  public int getConversationId() {
    return conversationId;
  }
}
