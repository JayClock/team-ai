package com.businessdrivenai.persistence.mybatis.mappers;

import com.businessdrivenai.domain.description.ConversationDescription;
import com.businessdrivenai.domain.model.Conversation;
import com.businessdrivenai.persistence.support.IdHolder;
import java.util.List;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;

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

  int deleteConversation(@Param("project_id") int projectId, @Param("id") int id);

  int countConversationsByProject(@Param("project_id") int projectId);
}
