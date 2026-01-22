package reengineering.ddd.teamai.mybatis.associations;

import jakarta.inject.Inject;
import java.util.List;
import org.springframework.cache.annotation.CacheEvict;
import org.springframework.cache.annotation.Cacheable;
import org.springframework.cache.annotation.Caching;
import reengineering.ddd.mybatis.database.EntityList;
import reengineering.ddd.mybatis.support.IdHolder;
import reengineering.ddd.teamai.description.BizDiagramDescription;
import reengineering.ddd.teamai.model.BizDiagram;
import reengineering.ddd.teamai.model.Project;
import reengineering.ddd.teamai.mybatis.cache.AssociationMapping;
import reengineering.ddd.teamai.mybatis.mappers.ProjectBizDiagramsMapper;

@AssociationMapping(entity = Project.class, field = "bizDiagrams", parentIdField = "projectId")
public class ProjectBizDiagrams extends EntityList<String, BizDiagram>
    implements Project.BizDiagrams {

  private static final String CACHE_NAME = "projectBizDiagrams";
  private static final String CACHE_LIST = "projectBizDiagramsList";
  private static final String CACHE_COUNT = "projectBizDiagramsCount";

  private int projectId;

  @Inject private ProjectBizDiagramsMapper mapper;

  @Override
  @Cacheable(value = CACHE_LIST, key = "#root.target.projectId + ':' + #from + ':' + #to")
  protected List<BizDiagram> findEntities(int from, int to) {
    return mapper.findDiagramsByProjectId(projectId, from, to - from);
  }

  @Override
  @Cacheable(
      value = CACHE_NAME,
      key = "#root.target.projectId + ':' + #id",
      unless = "#result == null")
  protected BizDiagram findEntity(String id) {
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
        @CacheEvict(value = CACHE_COUNT, key = "#root.target.projectId"),
        @CacheEvict(value = CACHE_NAME, key = "#root.target.projectId + ':' + #id")
      })
  public BizDiagram add(BizDiagramDescription description) {
    IdHolder idHolder = new IdHolder();
    mapper.insertDiagram(idHolder, projectId, description);
    return findEntity(String.valueOf(idHolder.id()));
  }

  @Override
  @Caching(
      evict = {
        @CacheEvict(value = CACHE_LIST, allEntries = true),
        @CacheEvict(value = CACHE_COUNT, key = "#root.target.projectId"),
        @CacheEvict(value = CACHE_NAME, key = "#root.target.projectId + ':' + #id")
      })
  public void delete(String id) {
    mapper.deleteDiagram(projectId, Integer.parseInt(id));
  }
}
