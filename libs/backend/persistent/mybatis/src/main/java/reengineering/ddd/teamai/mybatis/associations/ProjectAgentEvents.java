package reengineering.ddd.teamai.mybatis.associations;

import jakarta.inject.Inject;
import java.util.List;
import org.springframework.cache.annotation.CacheEvict;
import org.springframework.cache.annotation.Cacheable;
import org.springframework.cache.annotation.Caching;
import reengineering.ddd.mybatis.database.EntityList;
import reengineering.ddd.mybatis.support.IdHolder;
import reengineering.ddd.teamai.description.AgentEventDescription;
import reengineering.ddd.teamai.model.AgentEvent;
import reengineering.ddd.teamai.model.Project;
import reengineering.ddd.teamai.mybatis.cache.AssociationMapping;
import reengineering.ddd.teamai.mybatis.mappers.ProjectAgentEventsMapper;

@AssociationMapping(entity = Project.class, field = "events", parentIdField = "projectId")
public class ProjectAgentEvents extends EntityList<String, AgentEvent>
    implements Project.AgentEvents {

  private static final String CACHE_NAME = "projectAgentEvents";
  private static final String CACHE_LIST = "projectAgentEventsList";
  private static final String CACHE_COUNT = "projectAgentEventsCount";

  private int projectId;

  @Inject private ProjectAgentEventsMapper mapper;

  @Override
  @Cacheable(value = CACHE_LIST, key = "#root.target.projectId + ':' + #from + ':' + #to")
  protected List<AgentEvent> findEntities(int from, int to) {
    return mapper.findEventsByProjectId(projectId, from, to - from);
  }

  @Override
  @Cacheable(
      value = CACHE_NAME,
      key = "#root.target.projectId + ':' + #id",
      unless = "#result == null")
  protected AgentEvent findEntity(String id) {
    return mapper.findEventByProjectAndId(projectId, Integer.parseInt(id));
  }

  @Override
  @Cacheable(value = CACHE_COUNT, key = "#root.target.projectId")
  public int size() {
    return mapper.countEventsByProject(projectId);
  }

  @Override
  @Caching(
      evict = {
        @CacheEvict(value = CACHE_LIST, allEntries = true),
        @CacheEvict(value = CACHE_COUNT, key = "#root.target.projectId")
      })
  public AgentEvent append(AgentEventDescription description) {
    IdHolder idHolder = new IdHolder();
    mapper.insertEvent(idHolder, projectId, description);
    return findEntity(String.valueOf(idHolder.id()));
  }
}
