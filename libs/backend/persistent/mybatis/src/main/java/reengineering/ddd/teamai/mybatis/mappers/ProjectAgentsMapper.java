package reengineering.ddd.teamai.mybatis.mappers;

import java.util.List;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;
import reengineering.ddd.archtype.Ref;
import reengineering.ddd.mybatis.support.IdHolder;
import reengineering.ddd.teamai.description.AgentDescription;
import reengineering.ddd.teamai.model.Agent;

@Mapper
public interface ProjectAgentsMapper {
  Agent findAgentByProjectAndId(@Param("project_id") int projectId, @Param("id") int id);

  List<Agent> findAgentsByProjectId(
      @Param("project_id") int projectId, @Param("from") int from, @Param("size") int size);

  int insertAgent(
      @Param("holder") IdHolder holder,
      @Param("project_id") int projectId,
      @Param("description") AgentDescription description);

  int updateAgent(
      @Param("project_id") int projectId,
      @Param("id") int id,
      @Param("description") AgentDescription description);

  int deleteAgent(@Param("project_id") int projectId, @Param("id") int id);

  int updateAgentStatus(
      @Param("project_id") int projectId,
      @Param("agent") Ref<String> agent,
      @Param("status") AgentDescription.Status status);

  int countAgentsByProject(@Param("project_id") int projectId);
}
