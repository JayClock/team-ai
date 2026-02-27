package reengineering.ddd.teamai.mybatis.associations;

import jakarta.inject.Inject;
import java.util.ArrayList;
import java.util.Collection;
import java.util.List;
import java.util.Map;
import org.springframework.cache.annotation.CacheEvict;
import org.springframework.cache.annotation.Cacheable;
import reengineering.ddd.archtype.Ref;
import reengineering.ddd.mybatis.database.EntityList;
import reengineering.ddd.mybatis.support.IdHolder;
import reengineering.ddd.teamai.description.EdgeDescription;
import reengineering.ddd.teamai.model.Diagram;
import reengineering.ddd.teamai.model.DiagramEdge;
import reengineering.ddd.teamai.model.Project;
import reengineering.ddd.teamai.mybatis.cache.AssociationMapping;
import reengineering.ddd.teamai.mybatis.mappers.DiagramEdgesMapper;

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

  @Override
  @CacheEvict(value = CACHE_NAME, key = "#root.target.diagramId + '*")
  public List<DiagramEdge> addAll(Collection<EdgeDescription> descriptions) {
    if (descriptions == null || descriptions.isEmpty()) {
      return List.of();
    }

    List<DiagramEdge> createdEdges = new ArrayList<>(descriptions.size());
    for (EdgeDescription description : descriptions) {
      IdHolder idHolder = new IdHolder();
      mapper.insertEdge(idHolder, diagramId, description);
      createdEdges.add(findEntity(String.valueOf(idHolder.id())));
    }
    return List.copyOf(createdEdges);
  }

  @CacheEvict(value = CACHE_NAME, key = "#root.target.diagramId + '*")
  public void commitDraftEdges(
      Collection<Project.Diagrams.DraftEdge> draftEdges, Map<String, String> createdNodeIdByRef) {
    List<Project.Diagrams.DraftEdge> requestedEdges =
        draftEdges == null ? List.of() : List.copyOf(draftEdges);
    Map<String, String> resolvedNodeIdByRef =
        createdNodeIdByRef == null ? Map.of() : Map.copyOf(createdNodeIdByRef);
    mapper.deleteEdgesByDiagram(diagramId);
    List<EdgeDescription> edgeDescriptions =
        buildDraftEdgeDescriptions(requestedEdges, resolvedNodeIdByRef);
    addAll(edgeDescriptions);
  }

  private static List<EdgeDescription> buildDraftEdgeDescriptions(
      List<Project.Diagrams.DraftEdge> requestedEdges, Map<String, String> createdNodeIdByRef) {
    List<EdgeDescription> edgeDescriptions = new ArrayList<>(requestedEdges.size());
    for (Project.Diagrams.DraftEdge draftEdge : requestedEdges) {
      if (draftEdge == null) {
        throw new Project.Diagrams.InvalidDraftException("Edge request must provide nodeId.");
      }
      String sourceNodeId = resolveNodeId(draftEdge.sourceNodeId(), createdNodeIdByRef);
      String targetNodeId = resolveNodeId(draftEdge.targetNodeId(), createdNodeIdByRef);
      edgeDescriptions.add(
          new EdgeDescription(
              new Ref<>(sourceNodeId), new Ref<>(targetNodeId), null, null, null, null, null));
    }
    return edgeDescriptions;
  }

  private static String resolveNodeId(String nodeId, Map<String, String> createdNodeIdByRef) {
    if (nodeId == null || nodeId.isBlank()) {
      throw new Project.Diagrams.InvalidDraftException("Edge request must provide nodeId.");
    }
    String resolvedId = createdNodeIdByRef.get(nodeId);
    if (resolvedId != null) {
      return resolvedId;
    }
    if (nodeId.matches("node-\\d+")) {
      throw new Project.Diagrams.InvalidDraftException("Unknown node placeholder id: " + nodeId);
    }
    return nodeId;
  }
}
