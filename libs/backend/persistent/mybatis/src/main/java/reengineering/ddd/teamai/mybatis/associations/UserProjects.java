package reengineering.ddd.teamai.mybatis.associations;

import jakarta.inject.Inject;
import java.util.List;
import org.springframework.cache.annotation.CacheEvict;
import reengineering.ddd.mybatis.database.EntityList;
import reengineering.ddd.mybatis.support.IdHolder;
import reengineering.ddd.teamai.description.ProjectDescription;
import reengineering.ddd.teamai.model.Project;
import reengineering.ddd.teamai.model.User;
import reengineering.ddd.teamai.mybatis.cache.AssociationMapping;
import reengineering.ddd.teamai.mybatis.mappers.UserProjectsMapper;

@AssociationMapping(entity = User.class, field = "projects", parentIdField = "userId")
public class UserProjects extends EntityList<String, Project> implements User.Projects {

  private static final String CACHE_NAME = "userProjects";

  private int userId;

  @Inject UserProjectsMapper mapper;

  @Override
  protected List<Project> findEntities(int from, int to) {
    return mapper.findProjectsByUserId(userId, from, to - from);
  }

  @Override
  protected Project findEntity(String id) {
    return mapper.findProjectByUserAndId(userId, Integer.parseInt(id));
  }

  @Override
  public int size() {
    return mapper.countProjectsByUser(userId);
  }

  @Override
  @CacheEvict(value = CACHE_NAME, allEntries = true)
  public Project add(ProjectDescription description) {
    IdHolder idHolder = new IdHolder();
    mapper.insertProject(idHolder, userId, description);
    mapper.addMember(idHolder.id(), userId, "OWNER");
    return mapper.findProjectByUserAndId(userId, idHolder.id());
  }
}
