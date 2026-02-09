package com.businessdrivenai.persistence.mybatis.associations;

import com.businessdrivenai.domain.description.EdgeDescription;
import com.businessdrivenai.domain.model.Diagram;
import com.businessdrivenai.domain.model.DiagramEdge;
import com.businessdrivenai.persistence.database.EntityList;
import com.businessdrivenai.persistence.mybatis.cache.AssociationMapping;
import com.businessdrivenai.persistence.mybatis.mappers.DiagramEdgesMapper;
import com.businessdrivenai.persistence.support.IdHolder;
import jakarta.inject.Inject;
import java.util.List;
import org.springframework.cache.annotation.CacheEvict;
import org.springframework.cache.annotation.Cacheable;

@AssociationMapping(entity = Diagram.class, field = "edges", parentIdField = "diagramId")
public class DiagramEdges extends EntityList<String, DiagramEdge> implements Diagram.Edges {

  private static final String CACHE_NAME = "diagramEdges";

  private int diagramId;

  @Inject private DiagramEdgesMapper mapper;

  @Override
  @Cacheable(value = CACHE_NAME, key = "#root.target.diagramId")
  protected List<DiagramEdge> findEntities(int from, int to) {
    return mapper.findEdgesByDiagramId(diagramId);
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
  @Cacheable(value = CACHE_NAME, key = "#root.target.diagramId + ':size'")
  public int size() {
    return mapper.countEdgesByDiagram(diagramId);
  }

  @Override
  @CacheEvict(value = CACHE_NAME, key = "#root.target.diagramId + '*")
  public DiagramEdge add(EdgeDescription description) {
    IdHolder idHolder = new IdHolder();
    mapper.insertEdge(idHolder, diagramId, description);
    return findEntity(String.valueOf(idHolder.id()));
  }
}
