package reengineering.ddd.teamai.mybatis.mappers;

import java.util.List;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;
import reengineering.ddd.mybatis.support.IdHolder;
import reengineering.ddd.teamai.description.ConversationDescription;
import reengineering.ddd.teamai.model.Conversation;

@Mapper
public interface ProjectConversationsMapper {
  Conversation findConversationByProjectAndId(
      @Param("project_id") int projectId, @Param("id") int id);

  List<Conversation> findConversationsByProjectId(
      @Param("project_id") int projectId, @Param("from") int from, @Param("size") int size);

  int insertConversation(
      @Param("holder") IdHolder holder,
      @Param("project_id") int projectId,
      @Param("description") ConversationDescription description);

  int countConversationsByProject(@Param("project_id") int projectId);
}
