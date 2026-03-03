package reengineering.ddd.teamai.mybatis.mappers;

import java.time.Instant;
import java.util.List;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;
import reengineering.ddd.mybatis.support.IdHolder;
import reengineering.ddd.teamai.description.OrchestrationStepDescription;
import reengineering.ddd.teamai.model.OrchestrationStep;

@Mapper
public interface ProjectOrchestrationStepsMapper {
  OrchestrationStep findStepByProjectSessionAndId(
      @Param("project_id") int projectId, @Param("session_id") int sessionId, @Param("id") int id);

  List<OrchestrationStep> findStepsByProjectAndSessionId(
      @Param("project_id") int projectId, @Param("session_id") int sessionId);

  OrchestrationStep findNextPendingStepByProjectAndSessionId(
      @Param("project_id") int projectId, @Param("session_id") int sessionId);

  int insertStep(
      @Param("holder") IdHolder holder,
      @Param("project_id") int projectId,
      @Param("session_id") int sessionId,
      @Param("sequence_no") int sequenceNo,
      @Param("description") OrchestrationStepDescription description);

  int updateStepStatus(
      @Param("project_id") int projectId,
      @Param("session_id") int sessionId,
      @Param("id") int id,
      @Param("status") OrchestrationStepDescription.Status status,
      @Param("started_at") Instant startedAt,
      @Param("completed_at") Instant completedAt,
      @Param("failure_reason") String failureReason);
}
