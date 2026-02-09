package com.businessdrivenai.persistence.mybatis.associations;

import com.businessdrivenai.domain.description.LogicalEntityDescription;
import com.businessdrivenai.domain.model.LogicalEntity;
import com.businessdrivenai.domain.model.Project;
import com.businessdrivenai.persistence.database.EntityList;
import com.businessdrivenai.persistence.mybatis.cache.AssociationMapping;
import com.businessdrivenai.persistence.mybatis.mappers.ProjectLogicalEntitiesMapper;
import com.businessdrivenai.persistence.support.IdHolder;
import jakarta.inject.Inject;
import java.util.List;
import org.springframework.cache.annotation.CacheEvict;
import org.springframework.cache.annotation.Cacheable;
import org.springframework.cache.annotation.Caching;

@AssociationMapping(entity = Project.class, field = "logicalEntities", parentIdField = "projectId")
public class ProjectLogicalEntities extends EntityList<String, LogicalEntity>
    implements Project.LogicalEntities {

  private static final String CACHE_NAME = "projectLogicalEntities";
  private static final String CACHE_LIST = "projectLogicalEntitiesList";
  private static final String CACHE_COUNT = "projectLogicalEntitiesCount";

  private int projectId;

  @Inject private ProjectLogicalEntitiesMapper mapper;

  @Override
  @Cacheable(value = CACHE_LIST, key = "#root.target.projectId + ':' + #from + ':' + #to")
  protected List<LogicalEntity> findEntities(int from, int to) {
    return mapper.findLogicalEntitiesByProjectId(projectId, from, to - from);
  }

  @Override
  @Cacheable(
      value = CACHE_NAME,
      key = "#root.target.projectId + ':' + #id",
      unless = "#result == null")
  protected LogicalEntity findEntity(String id) {
    return mapper.findLogicalEntityByProjectAndId(projectId, Integer.parseInt(id));
  }

  @Override
  @Cacheable(value = CACHE_COUNT, key = "#root.target.projectId")
  public int size() {
    return mapper.countLogicalEntitiesByProject(projectId);
  }

  @Override
  @Caching(
      evict = {
        @CacheEvict(value = CACHE_LIST, allEntries = true),
        @CacheEvict(value = CACHE_COUNT, key = "#root.target.projectId")
      })
  public LogicalEntity add(LogicalEntityDescription description) {
    IdHolder idHolder = new IdHolder();
    mapper.insertLogicalEntity(idHolder, projectId, description);
    return findEntity(String.valueOf(idHolder.id()));
  }
}
