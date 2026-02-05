package reengineering.ddd.teamai.mybatis.associations;

import jakarta.inject.Inject;
import java.util.List;
import org.springframework.cache.annotation.CacheEvict;
import org.springframework.cache.annotation.Cacheable;
import org.springframework.cache.annotation.Caching;
import reengineering.ddd.mybatis.database.EntityList;
import reengineering.ddd.mybatis.support.IdHolder;
import reengineering.ddd.teamai.description.NodeDescription;
import reengineering.ddd.teamai.model.Diagram;
import reengineering.ddd.teamai.model.DiagramNode;
import reengineering.ddd.teamai.mybatis.cache.AssociationMapping;
import reengineering.ddd.teamai.mybatis.mappers.DiagramNodesMapper;

@AssociationMapping(entity = Diagram.class, field = "nodes", parentIdField = "diagramId")
public class DiagramNodes extends EntityList<String, DiagramNode> implements Diagram.Nodes {

  private static final String CACHE_NAME = "diagramNodes";
  private static final String CACHE_LIST = "diagramNodesList";
  private static final String CACHE_COUNT = "diagramNodesCount";

  private int diagramId;

  @Inject private DiagramNodesMapper mapper;

  @Override
  @Cacheable(value = CACHE_LIST, key = "#root.target.diagramId + ':' + #from + ':' + #to")
  protected List<DiagramNode> findEntities(int from, int to) {
    return mapper.findNodesByDiagramId(diagramId, from, to - from);
  }

  @Override
  @Cacheable(
      value = CACHE_NAME,
      key = "#root.target.diagramId + ':' + #id",
      unless = "#result == null")
  protected DiagramNode findEntity(String id) {
    return mapper.findNodeByDiagramAndId(diagramId, Integer.parseInt(id));
  }

  @Override
  @Cacheable(value = CACHE_COUNT, key = "#root.target.diagramId")
  public int size() {
    return mapper.countNodesByDiagram(diagramId);
  }

  @Override
  @Caching(
      evict = {
        @CacheEvict(value = CACHE_LIST, allEntries = true),
        @CacheEvict(value = CACHE_COUNT, key = "#root.target.diagramId")
      })
  public DiagramNode add(NodeDescription description) {
    IdHolder idHolder = new IdHolder();
    mapper.insertNode(idHolder, diagramId, description);
    return findEntity(String.valueOf(idHolder.id()));
  }
}
