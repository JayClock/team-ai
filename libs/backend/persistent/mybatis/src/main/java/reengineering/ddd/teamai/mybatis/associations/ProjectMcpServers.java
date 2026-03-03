package reengineering.ddd.teamai.mybatis.associations;

import jakarta.inject.Inject;
import java.util.List;
import org.springframework.cache.annotation.CacheEvict;
import org.springframework.cache.annotation.Cacheable;
import org.springframework.cache.annotation.Caching;
import reengineering.ddd.mybatis.database.EntityList;
import reengineering.ddd.mybatis.support.IdHolder;
import reengineering.ddd.teamai.description.McpServerDescription;
import reengineering.ddd.teamai.model.McpServer;
import reengineering.ddd.teamai.model.Project;
import reengineering.ddd.teamai.mybatis.cache.AssociationMapping;
import reengineering.ddd.teamai.mybatis.mappers.ProjectMcpServersMapper;

@AssociationMapping(entity = Project.class, field = "mcpServers", parentIdField = "projectId")
public class ProjectMcpServers extends EntityList<String, McpServer> implements Project.McpServers {
  private static final String CACHE_NAME = "projectMcpServers";
  private static final String CACHE_LIST = "projectMcpServersList";
  private static final String CACHE_COUNT = "projectMcpServersCount";

  private int projectId;

  @Inject private ProjectMcpServersMapper mapper;

  @Override
  @Cacheable(value = CACHE_LIST, key = "#root.target.projectId + ':' + #from + ':' + #to")
  protected List<McpServer> findEntities(int from, int to) {
    return mapper.findMcpServersByProjectId(projectId, from, to - from);
  }

  @Override
  @Cacheable(
      value = CACHE_NAME,
      key = "#root.target.projectId + ':' + #id",
      unless = "#result == null")
  protected McpServer findEntity(String id) {
    return mapper.findMcpServerByProjectAndId(projectId, Integer.parseInt(id));
  }

  @Override
  @Cacheable(value = CACHE_COUNT, key = "#root.target.projectId")
  public int size() {
    return mapper.countMcpServersByProject(projectId);
  }

  @Override
  @Caching(
      evict = {
        @CacheEvict(value = CACHE_LIST, allEntries = true),
        @CacheEvict(value = CACHE_COUNT, key = "#root.target.projectId")
      })
  public McpServer create(McpServerDescription description) {
    IdHolder idHolder = new IdHolder();
    mapper.insertMcpServer(idHolder, projectId, description);
    return findEntity(String.valueOf(idHolder.id()));
  }

  @Override
  @Caching(
      evict = {
        @CacheEvict(value = CACHE_LIST, allEntries = true),
        @CacheEvict(value = CACHE_NAME, allEntries = true)
      })
  public void update(String serverId, McpServerDescription description) {
    mapper.updateMcpServer(projectId, Integer.parseInt(serverId), description);
  }

  @Override
  @Caching(
      evict = {
        @CacheEvict(value = CACHE_LIST, allEntries = true),
        @CacheEvict(value = CACHE_NAME, allEntries = true),
        @CacheEvict(value = CACHE_COUNT, key = "#root.target.projectId")
      })
  public void delete(String serverId) {
    mapper.deleteMcpServer(projectId, Integer.parseInt(serverId));
  }
}
