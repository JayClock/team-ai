package reengineering.ddd.teamai.mybatis.mappers;

import java.time.Instant;
import java.util.List;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;
import reengineering.ddd.mybatis.support.IdHolder;
import reengineering.ddd.teamai.description.AcpSessionDescription;
import reengineering.ddd.teamai.model.AcpSession;

@Mapper
public interface ProjectAcpSessionsMapper {
  AcpSession findSessionByProjectAndId(@Param("project_id") int projectId, @Param("id") int id);

  List<AcpSession> findSessionsByProjectId(
      @Param("project_id") int projectId, @Param("from") int from, @Param("size") int size);

  int insertSession(
      @Param("holder") IdHolder holder,
      @Param("project_id") int projectId,
      @Param("description") AcpSessionDescription description);

  int updateSessionStatus(
      @Param("project_id") int projectId,
      @Param("id") int id,
      @Param("status") AcpSessionDescription.Status status,
      @Param("completed_at") Instant completedAt,
      @Param("failure_reason") String failureReason);

  int touchSession(
      @Param("project_id") int projectId,
      @Param("id") int id,
      @Param("last_activity_at") Instant lastActivityAt);

  int bindLastEventId(
      @Param("project_id") int projectId,
      @Param("id") int id,
      @Param("last_event_id") String lastEventId);

  int countSessionsByProject(@Param("project_id") int projectId);
}
