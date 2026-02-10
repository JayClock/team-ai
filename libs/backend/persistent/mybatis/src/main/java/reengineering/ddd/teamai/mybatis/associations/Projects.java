package reengineering.ddd.teamai.mybatis.associations;

import jakarta.inject.Inject;
import java.util.List;
import org.springframework.cache.annotation.CacheEvict;
import org.springframework.cache.annotation.Cacheable;
import org.springframework.cache.annotation.Caching;
import org.springframework.stereotype.Component;
import reengineering.ddd.mybatis.database.EntityList;
import reengineering.ddd.teamai.model.Project;
import reengineering.ddd.teamai.mybatis.mappers.ProjectsMapper;

@Component
public class Projects extends EntityList<String, Project>
    implements reengineering.ddd.teamai.model.Projects {

  private static final String CACHE_NAME = "projects";
  private static final String CACHE_LIST = "projectsList";
  private static final String CACHE_COUNT = "projectsCount";
  private static final String CACHE_USER_PROJECTS = "userProjects";

  private final ProjectsMapper mapper;

  @Inject
  public Projects(ProjectsMapper mapper) {
    this.mapper = mapper;
  }

  @Override
  @Cacheable(value = CACHE_COUNT)
  public int size() {
    return mapper.countAllProjects();
  }

  @Override
  @Cacheable(value = CACHE_LIST, key = "#from + ':' + #to")
  protected List<Project> findEntities(int from, int to) {
    return mapper.findAllProjects(from, to - from);
  }

  @Override
  @Cacheable(value = CACHE_NAME, key = "#id", unless = "#result == null")
  protected Project findEntity(String id) {
    return mapper.findProjectById(Integer.parseInt(id));
  }

  @Override
  @Caching(
      evict = {
        @CacheEvict(value = CACHE_LIST, allEntries = true),
        @CacheEvict(value = CACHE_COUNT, allEntries = true),
        @CacheEvict(value = CACHE_NAME, key = "#id"),
        @CacheEvict(value = CACHE_USER_PROJECTS, allEntries = true)
      })
  public void delete(String id) {
    mapper.deleteProject(Integer.parseInt(id));
  }
}
