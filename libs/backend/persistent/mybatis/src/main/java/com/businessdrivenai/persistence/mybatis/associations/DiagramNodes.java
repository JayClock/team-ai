package com.businessdrivenai.persistence.mybatis.associations;

import com.businessdrivenai.domain.description.NodeDescription;
import com.businessdrivenai.domain.model.Diagram;
import com.businessdrivenai.domain.model.DiagramNode;
import com.businessdrivenai.persistence.database.EntityList;
import com.businessdrivenai.persistence.mybatis.cache.AssociationMapping;
import com.businessdrivenai.persistence.mybatis.mappers.DiagramNodesMapper;
import com.businessdrivenai.persistence.support.IdHolder;
import jakarta.inject.Inject;
import java.util.List;
import org.springframework.cache.annotation.CacheEvict;
import org.springframework.cache.annotation.Cacheable;

@AssociationMapping(entity = Diagram.class, field = "nodes", parentIdField = "diagramId")
public class DiagramNodes extends EntityList<String, DiagramNode> implements Diagram.Nodes {

  private static final String CACHE_NAME = "diagramNodes";

  private int diagramId;

  @Inject private DiagramNodesMapper mapper;

  @Override
  @Cacheable(value = CACHE_NAME, key = "#root.target.diagramId")
  protected List<DiagramNode> findEntities(int from, int to) {
    return mapper.findNodesByDiagramId(diagramId);
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
  @Cacheable(value = CACHE_NAME, key = "#root.target.diagramId + ':size'")
  public int size() {
    return mapper.countNodesByDiagram(diagramId);
  }

  @Override
  @CacheEvict(value = CACHE_NAME, key = "#root.target.diagramId + '*")
  public DiagramNode add(NodeDescription description) {
    IdHolder idHolder = new IdHolder();
    mapper.insertNode(idHolder, diagramId, description);
    return findEntity(String.valueOf(idHolder.id()));
  }
}
