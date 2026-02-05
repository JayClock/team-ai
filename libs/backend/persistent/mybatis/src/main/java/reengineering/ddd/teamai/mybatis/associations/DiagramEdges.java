package reengineering.ddd.teamai.mybatis.associations;

import jakarta.inject.Inject;
import java.util.List;
import org.springframework.cache.annotation.CacheEvict;
import org.springframework.cache.annotation.Cacheable;
import org.springframework.cache.annotation.Caching;
import reengineering.ddd.mybatis.database.EntityList;
import reengineering.ddd.mybatis.support.IdHolder;
import reengineering.ddd.teamai.description.EdgeDescription;
import reengineering.ddd.teamai.model.Diagram;
import reengineering.ddd.teamai.model.DiagramEdge;
import reengineering.ddd.teamai.mybatis.cache.AssociationMapping;
import reengineering.ddd.teamai.mybatis.mappers.DiagramEdgesMapper;

@AssociationMapping(entity = Diagram.class, field = "edges", parentIdField = "diagramId")
public class DiagramEdges extends EntityList<String, DiagramEdge> implements Diagram.Edges {

  private static final String CACHE_NAME = "diagramEdges";
  private static final String CACHE_LIST = "diagramEdgesList";
  private static final String CACHE_COUNT = "diagramEdgesCount";

  private int diagramId;

  @Inject private DiagramEdgesMapper mapper;

  @Override
  @Cacheable(value = CACHE_LIST, key = "#root.target.diagramId + ':' + #from + ':' + #to")
  protected List<DiagramEdge> findEntities(int from, int to) {
    return mapper.findEdgesByDiagramId(diagramId, from, to - from);
  }

  @Override
  @Cacheable(
      value = CACHE_NAME,
      key = "#root.target.diagramId + ':' + #id",
      unless = "#result == null")
  protected DiagramEdge findEntity(String id) {
    return mapper.findEdgeByDiagramAndId(diagramId, Integer.parseInt(id));
  }

  @Override
  @Cacheable(value = CACHE_COUNT, key = "#root.target.diagramId")
  public int size() {
    return mapper.countEdgesByDiagram(diagramId);
  }

  @Override
  @Caching(
      evict = {
        @CacheEvict(value = CACHE_LIST, allEntries = true),
        @CacheEvict(value = CACHE_COUNT, key = "#root.target.diagramId")
      })
  public DiagramEdge add(EdgeDescription description) {
    IdHolder idHolder = new IdHolder();
    mapper.insertEdge(idHolder, diagramId, description);
    return findEntity(String.valueOf(idHolder.id()));
  }
}
