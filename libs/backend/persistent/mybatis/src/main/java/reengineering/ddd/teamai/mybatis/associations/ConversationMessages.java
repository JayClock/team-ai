package reengineering.ddd.teamai.mybatis.associations;

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
import reengineering.ddd.teamai.mybatis.cache.AssociationMapping;
import reengineering.ddd.teamai.mybatis.mappers.ConversationMessagesMapper;

@AssociationMapping(
    entity = Conversation.class,
    field = "messages",
    parentIdField = "conversationId")
public class ConversationMessages extends EntityList<String, Message>
    implements Conversation.Messages {

  private static final String CACHE_NAME = "conversationMessages";
  private static final String CACHE_LIST = "conversationMessagesList";
  private static final String CACHE_COUNT = "conversationMessagesCount";

  private int conversationId;

  @Inject private ConversationMessagesMapper mapper;

  @Override
  @Cacheable(value = CACHE_LIST, key = "#root.target.conversationId + ':' + #from + ':' + #to")
  protected List<Message> findEntities(int from, int to) {
    return mapper.subMessagesByConversation(conversationId, from, to - from);
  }

  @Override
  @Cacheable(
      value = CACHE_NAME,
      key = "#root.target.conversationId + ':' + #id",
      unless = "#result == null")
  protected Message findEntity(String id) {
    return mapper.findMessageByConversationAndId(conversationId, Integer.parseInt(id));
  }

  @Override
  @Cacheable(value = CACHE_COUNT, key = "#root.target.conversationId")
  public int size() {
    return this.mapper.countMessagesByConversation(conversationId);
  }

  @Override
  @Caching(
      evict = {
        @CacheEvict(value = CACHE_LIST, allEntries = true),
        @CacheEvict(value = CACHE_COUNT, key = "#root.target.conversationId")
      })
  public Message saveMessage(MessageDescription description) {
    IdHolder idHolder = new IdHolder();
    mapper.insertMessage(idHolder, conversationId, description);
    return findEntity(String.valueOf(idHolder.id()));
  }
}
