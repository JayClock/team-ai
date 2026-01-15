package reengineering.ddd.teamai.mybatis.mappers;

import java.util.List;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;
import reengineering.ddd.mybatis.support.IdHolder;
import reengineering.ddd.teamai.description.MessageDescription;
import reengineering.ddd.teamai.model.Message;

@Mapper
public interface ConversationMessagesMapper {
  Message findMessageByConversationAndId(
      @Param("conversation_id") int conversationId, @Param("id") int id);

  List<Message> subMessagesByConversation(
      @Param("conversation_id") int conversationId,
      @Param("from") int from,
      @Param("size") int size);

  int insertMessage(
      @Param("holder") IdHolder id,
      @Param("conversation_id") int conversation_id,
      @Param("description") MessageDescription description);

  int countMessagesByConversation(@Param("conversation_id") int conversationId);
}
