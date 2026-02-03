package reengineering.ddd.teamai.mybatis.associations;

import jakarta.inject.Inject;
import java.util.Optional;
import org.springframework.cache.annotation.Cacheable;
import org.springframework.stereotype.Component;
import reengineering.ddd.teamai.model.Project;
import reengineering.ddd.teamai.mybatis.mappers.ProjectsMapper;

@Component
public class Projects implements reengineering.ddd.teamai.model.Projects {

  private static final String CACHE_NAME = "projects";

  private final ProjectsMapper mapper;

  @Inject
  public Projects(ProjectsMapper mapper) {
    this.mapper = mapper;
  }

  @Override
  @Cacheable(value = CACHE_NAME, key = "#id", unless = "#result == null")
  public Optional<Project> findByIdentity(String id) {
    return Optional.ofNullable(mapper.findProjectById(Integer.parseInt(id)));
  }
}
