package reengineering.ddd.teamai.mybatis.mappers;

import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;
import reengineering.ddd.mybatis.support.IdHolder;
import reengineering.ddd.teamai.description.ConversationDescription;
import reengineering.ddd.teamai.model.Conversation;

import java.util.List;

@Mapper
public interface ConversationsMapper {
  Conversation findConversationByUserAndId(@Param("user_id") String userId, @Param("id") String id);

  List<Conversation> findConversationsByUserId(@Param("user_id") String userId, @Param("from") int from, @Param("size") int size);

  int insertConversation(@Param("holder") IdHolder Id, @Param("user_id") String userId, @Param("description") ConversationDescription description);

  int countConversationByUser(@Param("user_id") String userId);
}
