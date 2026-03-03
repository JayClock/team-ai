package reengineering.ddd.teamai.mybatis.associations;

import jakarta.inject.Inject;
import java.time.Instant;
import java.util.List;
import org.springframework.cache.annotation.CacheEvict;
import org.springframework.cache.annotation.Cacheable;
import org.springframework.cache.annotation.Caching;
import reengineering.ddd.archtype.Many;
import reengineering.ddd.mybatis.database.EntityList;
import reengineering.ddd.mybatis.support.IdHolder;
import reengineering.ddd.teamai.description.AcpSessionDescription;
import reengineering.ddd.teamai.model.AcpSession;
import reengineering.ddd.teamai.model.Project;
import reengineering.ddd.teamai.mybatis.cache.AssociationMapping;
import reengineering.ddd.teamai.mybatis.mappers.ProjectAcpSessionsMapper;

@AssociationMapping(entity = Project.class, field = "acpSessions", parentIdField = "projectId")
public class ProjectAcpSessions extends EntityList<String, AcpSession>
    implements Project.AcpSessions {
  private static final String CACHE_NAME = "projectAcpSessions";
  private static final String CACHE_LIST = "projectAcpSessionsList";
  private static final String CACHE_COUNT = "projectAcpSessionsCount";

  private int projectId;

  @Inject private ProjectAcpSessionsMapper mapper;

  @Override
  @Cacheable(value = CACHE_LIST, key = "#root.target.projectId + ':' + #from + ':' + #to")
  protected List<AcpSession> findEntities(int from, int to) {
    return mapper.findSessionsByProjectId(projectId, from, to - from);
  }

  @Override
  @Cacheable(
      value = CACHE_NAME,
      key = "#root.target.projectId + ':' + #id",
      unless = "#result == null")
  protected AcpSession findEntity(String id) {
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
  public AcpSession create(AcpSessionDescription description) {
    IdHolder idHolder = new IdHolder();
    mapper.insertSession(idHolder, projectId, description);
    return findEntity(String.valueOf(idHolder.id()));
  }

  @Override
  public Many<AcpSession> findByProject(String projectId, int offset, int limit) {
    int requestedProjectId = Integer.parseInt(projectId);
    if (requestedProjectId != this.projectId) {
      return new Many<>() {
        @Override
        public int size() {
          return 0;
        }

        @Override
        public Many<AcpSession> subCollection(int from, int to) {
          return this;
        }

        @Override
        public java.util.Iterator<AcpSession> iterator() {
          return java.util.Collections.emptyIterator();
        }
      };
    }
    int to = offset + limit;
    return findAll().subCollection(offset, to);
  }

  @Override
  @Caching(
      evict = {
        @CacheEvict(value = CACHE_LIST, allEntries = true),
        @CacheEvict(value = CACHE_NAME, allEntries = true)
      })
  public void updateStatus(
      String sessionId,
      AcpSessionDescription.Status status,
      Instant completedAt,
      String failureReason) {
    mapper.updateSessionStatus(
        projectId, Integer.parseInt(sessionId), status, completedAt, failureReason);
  }

  @Override
  @Caching(
      evict = {
        @CacheEvict(value = CACHE_LIST, allEntries = true),
        @CacheEvict(value = CACHE_NAME, allEntries = true)
      })
  public void touch(String sessionId, Instant lastActivityAt) {
    mapper.touchSession(projectId, Integer.parseInt(sessionId), lastActivityAt);
  }

  @Override
  @Caching(
      evict = {
        @CacheEvict(value = CACHE_LIST, allEntries = true),
        @CacheEvict(value = CACHE_NAME, allEntries = true)
      })
  public void bindLastEventId(String sessionId, String lastEventId) {
    mapper.bindLastEventId(projectId, Integer.parseInt(sessionId), lastEventId);
  }
}
