package reengineering.ddd.teamai.mybatis.mappers;

import java.util.List;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;
import reengineering.ddd.mybatis.support.IdHolder;
import reengineering.ddd.teamai.description.AgentEventDescription;
import reengineering.ddd.teamai.model.AgentEvent;

@Mapper
public interface ProjectAgentEventsMapper {
  AgentEvent findEventByProjectAndId(@Param("project_id") int projectId, @Param("id") int id);

  List<AgentEvent> findEventsByProjectId(
      @Param("project_id") int projectId, @Param("from") int from, @Param("size") int size);

  int insertEvent(
      @Param("holder") IdHolder holder,
      @Param("project_id") int projectId,
      @Param("description") AgentEventDescription description);

  int countEventsByProject(@Param("project_id") int projectId);
}
