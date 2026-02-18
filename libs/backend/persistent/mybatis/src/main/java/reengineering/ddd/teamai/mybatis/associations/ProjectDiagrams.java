package reengineering.ddd.teamai.mybatis.associations;

import jakarta.inject.Inject;
import java.util.ArrayList;
import java.util.Collection;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import org.springframework.cache.annotation.CacheEvict;
import org.springframework.cache.annotation.Cacheable;
import org.springframework.cache.annotation.Caching;
import reengineering.ddd.archtype.Ref;
import reengineering.ddd.mybatis.database.EntityList;
import reengineering.ddd.mybatis.support.IdHolder;
import reengineering.ddd.teamai.description.DiagramDescription;
import reengineering.ddd.teamai.description.EdgeDescription;
import reengineering.ddd.teamai.description.NodeDescription;
import reengineering.ddd.teamai.model.Diagram;
import reengineering.ddd.teamai.model.DiagramEdge;
import reengineering.ddd.teamai.model.DiagramNode;
import reengineering.ddd.teamai.model.DiagramStatus;
import reengineering.ddd.teamai.model.Project;
import reengineering.ddd.teamai.mybatis.cache.AssociationMapping;
import reengineering.ddd.teamai.mybatis.mappers.ProjectDiagramsMapper;
import reengineering.ddd.teamai.mybatis.support.AssociationTransactionDecorator;

@AssociationMapping(entity = Project.class, field = "diagrams", parentIdField = "projectId")
public class ProjectDiagrams extends EntityList<String, Diagram> implements Project.Diagrams {

  private static final String CACHE_NAME = "projectDiagrams";
  private static final String CACHE_LIST = "projectDiagramsList";
  private static final String CACHE_COUNT = "projectDiagramsCount";

  private int projectId;

  @Inject private ProjectDiagramsMapper mapper;
  @Inject private AssociationTransactionDecorator transactionDecorator;

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

  @Override
  public Project.Diagrams.CommitDraftResult saveDiagram(
      String diagramId,
      Collection<Project.Diagrams.DraftNode> draftNodes,
      Collection<Project.Diagrams.DraftEdge> draftEdges) {
    return transactionDecorator.execute(() -> doCommitDraft(diagramId, draftNodes, draftEdges));
  }

  private Project.Diagrams.CommitDraftResult doCommitDraft(
      String diagramId,
      Collection<Project.Diagrams.DraftNode> draftNodes,
      Collection<Project.Diagrams.DraftEdge> draftEdges) {
    if (diagramId == null || diagramId.isBlank()) {
      throw new Project.Diagrams.InvalidDraftException("Diagram id must be provided.");
    }

    List<Project.Diagrams.DraftNode> requestedNodes =
        draftNodes == null ? List.of() : List.copyOf(draftNodes);
    List<Project.Diagrams.DraftEdge> requestedEdges =
        draftEdges == null ? List.of() : List.copyOf(draftEdges);

    List<String> draftNodeIds = new ArrayList<>(requestedNodes.size());
    Set<String> uniqueDraftNodeIds = new HashSet<>();
    List<NodeDescription> nodeDescriptions = new ArrayList<>(requestedNodes.size());
    for (Project.Diagrams.DraftNode draftNode : requestedNodes) {
      if (draftNode == null || draftNode.description() == null) {
        throw new Project.Diagrams.InvalidDraftException("Node request must provide description.");
      }
      String draftNodeId = draftNode.id();
      if (draftNodeId == null || draftNodeId.isBlank()) {
        throw new Project.Diagrams.InvalidDraftException("Node request must provide id.");
      }
      if (!uniqueDraftNodeIds.add(draftNodeId)) {
        throw new Project.Diagrams.InvalidDraftException("Duplicated node id: " + draftNodeId);
      }
      draftNodeIds.add(draftNodeId);
      nodeDescriptions.add(draftNode.description());
    }

    Diagram diagram =
        findByIdentity(diagramId)
            .orElseThrow(
                () ->
                    new Project.Diagrams.InvalidDraftException("Diagram not found: " + diagramId));

    List<DiagramNode> createdNodes = diagram.addNodes(nodeDescriptions);
    if (createdNodes.size() != draftNodeIds.size()) {
      throw new Project.Diagrams.InvalidDraftException("Node creation count mismatch.");
    }

    Map<String, String> createdNodeIdByRef = new LinkedHashMap<>();
    for (int index = 0; index < createdNodes.size(); index += 1) {
      String createdNodeId = createdNodes.get(index).getIdentity();
      if (createdNodeId == null || createdNodeId.isBlank()) {
        throw new Project.Diagrams.InvalidDraftException("Created node id must not be blank.");
      }
      createdNodeIdByRef.put(draftNodeIds.get(index), createdNodeId);
      // Backward compatibility with older indexed placeholder references.
      createdNodeIdByRef.put("node-" + (index + 1), createdNodeId);
    }

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

    List<DiagramEdge> createdEdges = diagram.addEdges(edgeDescriptions);
    mapper.updateDiagramStatus(projectId, Integer.parseInt(diagramId), DiagramStatus.DRAFT);
    return new Project.Diagrams.CommitDraftResult(createdNodes, createdEdges);
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
