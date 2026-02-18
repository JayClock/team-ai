package reengineering.ddd.teamai.mybatis.associations;

import jakarta.inject.Inject;
import java.util.List;
import org.springframework.cache.annotation.CacheEvict;
import org.springframework.cache.annotation.Cacheable;
import reengineering.ddd.mybatis.database.EntityList;
import reengineering.ddd.mybatis.support.IdHolder;
import reengineering.ddd.teamai.description.DiagramVersionDescription;
import reengineering.ddd.teamai.model.Diagram;
import reengineering.ddd.teamai.model.DiagramVersion;
import reengineering.ddd.teamai.mybatis.cache.AssociationMapping;
import reengineering.ddd.teamai.mybatis.mappers.DiagramVersionsMapper;

@AssociationMapping(entity = Diagram.class, field = "versions", parentIdField = "diagramId")
public class DiagramVersions extends EntityList<String, DiagramVersion>
    implements Diagram.Versions {

  private static final String CACHE_NAME = "diagramVersions";

  private int diagramId;

  @Inject private DiagramVersionsMapper mapper;

  @Override
  @Cacheable(value = CACHE_NAME, key = "#root.target.diagramId + ':' + #from + ':' + #to")
  protected List<DiagramVersion> findEntities(int from, int to) {
    return mapper.findVersionsByDiagramId(diagramId, from, to - from);
  }

  @Override
  @Cacheable(
      value = CACHE_NAME,
      key = "#root.target.diagramId + ':' + #id",
      unless = "#result == null")
  protected DiagramVersion findEntity(String id) {
    return mapper.findVersionByDiagramAndId(diagramId, Integer.parseInt(id));
  }

  @Override
  @Cacheable(value = CACHE_NAME, key = "#root.target.diagramId + ':size'")
  public int size() {
    return mapper.countVersionsByDiagram(diagramId);
  }

  @Override
  @CacheEvict(value = CACHE_NAME, key = "#root.target.diagramId + '*")
  public DiagramVersion add(DiagramVersionDescription description) {
    IdHolder idHolder = new IdHolder();
    mapper.insertVersion(idHolder, diagramId, description);
    return findEntity(String.valueOf(idHolder.id()));
  }
}
