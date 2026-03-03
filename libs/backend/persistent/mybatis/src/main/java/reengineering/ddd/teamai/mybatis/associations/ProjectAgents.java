package reengineering.ddd.teamai.mybatis.associations;

import jakarta.inject.Inject;
import java.util.List;
import org.springframework.cache.annotation.CacheEvict;
import org.springframework.cache.annotation.Cacheable;
import org.springframework.cache.annotation.Caching;
import reengineering.ddd.archtype.Ref;
import reengineering.ddd.mybatis.database.EntityList;
import reengineering.ddd.mybatis.support.IdHolder;
import reengineering.ddd.teamai.description.AgentDescription;
import reengineering.ddd.teamai.model.Agent;
import reengineering.ddd.teamai.model.Project;
import reengineering.ddd.teamai.mybatis.cache.AssociationMapping;
import reengineering.ddd.teamai.mybatis.mappers.ProjectAgentsMapper;

@AssociationMapping(entity = Project.class, field = "agents", parentIdField = "projectId")
public class ProjectAgents extends EntityList<String, Agent> implements Project.Agents {

  private static final String CACHE_NAME = "projectAgents";
  private static final String CACHE_LIST = "projectAgentsList";
  private static final String CACHE_COUNT = "projectAgentsCount";

  private int projectId;

  @Inject private ProjectAgentsMapper mapper;

  @Override
  @Cacheable(value = CACHE_LIST, key = "#root.target.projectId + ':' + #from + ':' + #to")
  protected List<Agent> findEntities(int from, int to) {
    return mapper.findAgentsByProjectId(projectId, from, to - from);
  }

  @Override
  @Cacheable(
      value = CACHE_NAME,
      key = "#root.target.projectId + ':' + #id",
      unless = "#result == null")
  protected Agent findEntity(String id) {
    return mapper.findAgentByProjectAndId(projectId, Integer.parseInt(id));
  }

  @Override
  @Cacheable(value = CACHE_COUNT, key = "#root.target.projectId")
  public int size() {
    return mapper.countAgentsByProject(projectId);
  }

  @Override
  @Caching(
      evict = {
        @CacheEvict(value = CACHE_LIST, allEntries = true),
        @CacheEvict(value = CACHE_COUNT, key = "#root.target.projectId")
      })
  public Agent create(AgentDescription description) {
    IdHolder idHolder = new IdHolder();
    mapper.insertAgent(idHolder, projectId, description);
    return findEntity(String.valueOf(idHolder.id()));
  }

  @Override
  @Caching(
      evict = {
        @CacheEvict(value = CACHE_LIST, allEntries = true),
        @CacheEvict(value = CACHE_NAME, allEntries = true)
      })
  public void update(String agentId, AgentDescription description) {
    mapper.updateAgent(projectId, Integer.parseInt(agentId), description);
  }

  @Override
  @Caching(
      evict = {
        @CacheEvict(value = CACHE_LIST, allEntries = true),
        @CacheEvict(value = CACHE_NAME, allEntries = true),
        @CacheEvict(value = CACHE_COUNT, key = "#root.target.projectId")
      })
  public void delete(String agentId) {
    mapper.deleteAgent(projectId, Integer.parseInt(agentId));
  }

  @Override
  @Caching(
      evict = {
        @CacheEvict(value = CACHE_LIST, allEntries = true),
        @CacheEvict(value = CACHE_NAME, allEntries = true)
      })
  public void updateStatus(Ref<String> agent, AgentDescription.Status status) {
    mapper.updateAgentStatus(projectId, agent, status);
  }
}
