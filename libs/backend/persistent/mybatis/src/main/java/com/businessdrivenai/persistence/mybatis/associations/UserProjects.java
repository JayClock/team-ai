package com.businessdrivenai.persistence.mybatis.associations;

import com.businessdrivenai.domain.description.ProjectDescription;
import com.businessdrivenai.domain.model.Project;
import com.businessdrivenai.domain.model.User;
import com.businessdrivenai.persistence.database.EntityList;
import com.businessdrivenai.persistence.mybatis.cache.AssociationMapping;
import com.businessdrivenai.persistence.mybatis.mappers.UserProjectsMapper;
import com.businessdrivenai.persistence.support.IdHolder;
import jakarta.inject.Inject;
import java.util.List;
import org.springframework.cache.annotation.CacheEvict;

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

  @Override
  @CacheEvict(value = CACHE_NAME, allEntries = true)
  public void delete(String id) {
    mapper.deleteProject(userId, Integer.parseInt(id));
  }
}
