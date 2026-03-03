package reengineering.ddd.teamai.mybatis.mappers;

import java.time.Instant;
import java.util.List;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;
import reengineering.ddd.archtype.Ref;
import reengineering.ddd.mybatis.support.IdHolder;
import reengineering.ddd.teamai.description.OrchestrationSessionDescription;
import reengineering.ddd.teamai.model.OrchestrationSession;

@Mapper
public interface ProjectOrchestrationSessionsMapper {
  OrchestrationSession findSessionByProjectAndId(
      @Param("project_id") int projectId, @Param("id") int id);

  List<OrchestrationSession> findSessionsByProjectId(
      @Param("project_id") int projectId, @Param("from") int from, @Param("size") int size);

  OrchestrationSession findSessionByProjectAndStartRequestId(
      @Param("project_id") int projectId, @Param("start_request_id") String startRequestId);

  int insertSession(
      @Param("holder") IdHolder holder,
      @Param("project_id") int projectId,
      @Param("description") OrchestrationSessionDescription description);

  int bindStartRequestId(
      @Param("project_id") int projectId,
      @Param("id") int id,
      @Param("start_request_id") String startRequestId);

  int updateSessionStatus(
      @Param("project_id") int projectId,
      @Param("id") int id,
      @Param("status") OrchestrationSessionDescription.Status status,
      @Param("current_step") Ref<String> currentStep,
      @Param("completed_at") Instant completedAt,
      @Param("failure_reason") String failureReason);

  int countSessionsByProject(@Param("project_id") int projectId);
}
