package com.businessdrivenai.persistence.mybatis.associations;

import com.businessdrivenai.domain.description.DiagramDescription;
import com.businessdrivenai.domain.model.Diagram;
import com.businessdrivenai.domain.model.Project;
import com.businessdrivenai.persistence.database.EntityList;
import com.businessdrivenai.persistence.mybatis.cache.AssociationMapping;
import com.businessdrivenai.persistence.mybatis.mappers.ProjectDiagramsMapper;
import com.businessdrivenai.persistence.support.IdHolder;
import jakarta.inject.Inject;
import java.util.List;
import org.springframework.cache.annotation.CacheEvict;
import org.springframework.cache.annotation.Cacheable;
import org.springframework.cache.annotation.Caching;

@AssociationMapping(entity = Project.class, field = "diagrams", parentIdField = "projectId")
public class ProjectDiagrams extends EntityList<String, Diagram> implements Project.Diagrams {

  private static final String CACHE_NAME = "projectDiagrams";
  private static final String CACHE_LIST = "projectDiagramsList";
  private static final String CACHE_COUNT = "projectDiagramsCount";

  private int projectId;

  @Inject private ProjectDiagramsMapper mapper;

  @Override
  @Cacheable(value = CACHE_LIST, key = "#root.target.projectId + ':' + #from + ':' + #to")
  protected List<Diagram> findEntities(int from, int to) {
    return mapper.findDiagramsByProjectId(projectId, from, to - from);
  }

  @Override
  @Cacheable(
      value = CACHE_NAME,
      key = "#root.target.projectId + ':' + #id",
      unless = "#result == null")
  protected Diagram findEntity(String id) {
    return mapper.findDiagramByProjectAndId(projectId, Integer.parseInt(id));
  }

  @Override
  @Cacheable(value = CACHE_COUNT, key = "#root.target.projectId")
  public int size() {
    return mapper.countDiagramsByProject(projectId);
  }

  @Override
  @Caching(
      evict = {
        @CacheEvict(value = CACHE_LIST, allEntries = true),
        @CacheEvict(value = CACHE_COUNT, key = "#root.target.projectId")
      })
  public Diagram add(DiagramDescription description) {
    IdHolder idHolder = new IdHolder();
    mapper.insertDiagram(idHolder, projectId, description);
    return findEntity(String.valueOf(idHolder.id()));
  }
}
