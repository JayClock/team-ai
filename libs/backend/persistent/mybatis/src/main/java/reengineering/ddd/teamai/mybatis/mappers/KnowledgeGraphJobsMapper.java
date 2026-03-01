package reengineering.ddd.teamai.mybatis.mappers;

import java.time.Instant;
import java.util.List;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;
import reengineering.ddd.teamai.mybatis.knowledgegraph.KnowledgeGraphJobRow;

@Mapper
public interface KnowledgeGraphJobsMapper {
  void upsertPublishJob(
      @Param("project_id") int projectId,
      @Param("diagram_id") int diagramId,
      @Param("requested_at") Instant requestedAt);

  List<KnowledgeGraphJobRow> claimPendingJobs(@Param("limit") int limit);

  void markSucceeded(@Param("id") long id);

  void requeue(
      @Param("id") long id,
      @Param("last_error") String lastError,
      @Param("retry_seconds") int retrySeconds);

  void markFailed(@Param("id") long id, @Param("last_error") String lastError);
}
