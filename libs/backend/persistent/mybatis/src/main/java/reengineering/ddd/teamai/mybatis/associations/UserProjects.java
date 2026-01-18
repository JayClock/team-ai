package reengineering.ddd.teamai.mybatis.associations;

import jakarta.inject.Inject;
import org.springframework.cache.annotation.CacheEvict;
import reengineering.ddd.mybatis.memory.EntityList;
import reengineering.ddd.mybatis.support.IdHolder;
import reengineering.ddd.teamai.description.ProjectDescription;
import reengineering.ddd.teamai.model.Project;
import reengineering.ddd.teamai.model.User;
import reengineering.ddd.teamai.mybatis.cache.AssociationMapping;
import reengineering.ddd.teamai.mybatis.mappers.UserProjectsMapper;

@AssociationMapping(entity = User.class, field = "projects", parentIdField = "userId", eager = true)
public class UserProjects extends EntityList<String, Project> implements User.Projects {

  private static final String CACHE_NAME = "userProjects";

  private int userId;

  @Inject UserProjectsMapper mapper;

  @Override
  @CacheEvict(value = CACHE_NAME, allEntries = true)
  public Project add(ProjectDescription description) {
    IdHolder idHolder = new IdHolder();
    mapper.insertProject(idHolder, userId, description);
    return mapper.findProjectByUserAndId(userId, idHolder.id());
  }

  @Override
  @CacheEvict(value = CACHE_NAME, allEntries = true)
  public void delete(String id) {
    mapper.deleteProject(userId, Integer.parseInt(id));
  }
}
