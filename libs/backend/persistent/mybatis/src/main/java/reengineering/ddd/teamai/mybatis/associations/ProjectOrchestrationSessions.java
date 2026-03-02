package reengineering.ddd.teamai.mybatis.associations;

import jakarta.inject.Inject;
import java.time.Instant;
import java.util.List;
import org.springframework.cache.annotation.CacheEvict;
import org.springframework.cache.annotation.Cacheable;
import org.springframework.cache.annotation.Caching;
import reengineering.ddd.archtype.Ref;
import reengineering.ddd.mybatis.database.EntityList;
import reengineering.ddd.mybatis.support.IdHolder;
import reengineering.ddd.teamai.description.OrchestrationSessionDescription;
import reengineering.ddd.teamai.model.OrchestrationSession;
import reengineering.ddd.teamai.model.Project;
import reengineering.ddd.teamai.mybatis.cache.AssociationMapping;
import reengineering.ddd.teamai.mybatis.mappers.ProjectOrchestrationSessionsMapper;

@AssociationMapping(
    entity = Project.class,
    field = "orchestrationSessions",
    parentIdField = "projectId")
public class ProjectOrchestrationSessions extends EntityList<String, OrchestrationSession>
    implements Project.OrchestrationSessions {

  private static final String CACHE_NAME = "projectOrchestrationSessions";
  private static final String CACHE_LIST = "projectOrchestrationSessionsList";
  private static final String CACHE_COUNT = "projectOrchestrationSessionsCount";

  private int projectId;

  @Inject private ProjectOrchestrationSessionsMapper mapper;

  @Override
  @Cacheable(value = CACHE_LIST, key = "#root.target.projectId + ':' + #from + ':' + #to")
  protected List<OrchestrationSession> findEntities(int from, int to) {
    return mapper.findSessionsByProjectId(projectId, from, to - from);
  }

  @Override
  @Cacheable(
      value = CACHE_NAME,
      key = "#root.target.projectId + ':' + #id",
      unless = "#result == null")
  protected OrchestrationSession findEntity(String id) {
    return mapper.findSessionByProjectAndId(projectId, Integer.parseInt(id));
  }

  @Override
  @Cacheable(value = CACHE_COUNT, key = "#root.target.projectId")
  public int size() {
    return mapper.countSessionsByProject(projectId);
  }

  @Override
  @Caching(
      evict = {
        @CacheEvict(value = CACHE_LIST, allEntries = true),
        @CacheEvict(value = CACHE_COUNT, key = "#root.target.projectId")
      })
  public OrchestrationSession create(OrchestrationSessionDescription description) {
    IdHolder idHolder = new IdHolder();
    mapper.insertSession(idHolder, projectId, description);
    return findEntity(String.valueOf(idHolder.id()));
  }

  @Override
  @Caching(
      evict = {
        @CacheEvict(value = CACHE_LIST, allEntries = true),
        @CacheEvict(value = CACHE_NAME, allEntries = true)
      })
  public void updateStatus(
      String sessionId,
      OrchestrationSessionDescription.Status status,
      Ref<String> currentStep,
      Instant completedAt,
      String failureReason) {
    mapper.updateSessionStatus(
        projectId, Integer.parseInt(sessionId), status, currentStep, completedAt, failureReason);
  }
}
