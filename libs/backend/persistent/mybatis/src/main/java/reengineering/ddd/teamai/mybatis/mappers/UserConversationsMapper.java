package reengineering.ddd.teamai.mybatis.mappers;

import java.util.List;
import org.apache.ibatis.annotations.CacheNamespaceRef;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;
import reengineering.ddd.mybatis.support.IdHolder;
import reengineering.ddd.teamai.description.ConversationDescription;
import reengineering.ddd.teamai.model.Conversation;

@Mapper
@CacheNamespaceRef(UsersMapper.class)
public interface UserConversationsMapper {
  Conversation findConversationByUserAndId(@Param("user_id") int userId, @Param("id") int id);

  List<Conversation> findConversationsByUserId(
      @Param("user_id") int userId, @Param("from") int from, @Param("size") int size);

  int insertConversation(
      @Param("holder") IdHolder Id,
      @Param("user_id") int userId,
      @Param("description") ConversationDescription description);

  int countConversationByUser(@Param("user_id") int userId);
}
