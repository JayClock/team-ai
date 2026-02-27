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
import reengineering.ddd.teamai.model.Diagram.Status;
import reengineering.ddd.teamai.model.DiagramNode;
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
  public void saveDiagram(
      String diagramId,
      Collection<Project.Diagrams.DraftNode> draftNodes,
      Collection<Project.Diagrams.DraftEdge> draftEdges) {
    transactionDecorator.execute(
        () -> {
          doCommitDraft(diagramId, draftNodes, draftEdges);
          return null;
        });
  }

  @Override
  public void publishDiagram(String diagramId) {
    if (diagramId == null || diagramId.isBlank()) {
      throw new Project.Diagrams.InvalidDraftException("Diagram id must be provided.");
    }
    int parsedDiagramId = Integer.parseInt(diagramId);
    Diagram diagram =
        findByIdentity(diagramId)
            .orElseThrow(
                () ->
                    new Project.Diagrams.InvalidDraftException("Diagram not found: " + diagramId));

    if (!(diagram.nodes() instanceof DiagramNodes diagramNodes)) {
      throw new IllegalStateException("Diagram nodes association must be DiagramNodes.");
    }

    transactionDecorator.execute(
        () -> {
          diagramNodes.promoteNodeLocalDataToLogicalEntitiesForPublish(projectId);
          mapper.updateDiagramStatus(projectId, parsedDiagramId, Status.PUBLISHED);
          return null;
        });
  }

  private void doCommitDraft(
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

    Set<String> uniqueDraftNodeIds = new HashSet<>();
    Map<String, Project.Diagrams.DraftNode> draftNodeById = new LinkedHashMap<>();
    Map<String, String> legacyAliasByDraftNodeId = new LinkedHashMap<>();
    Map<String, String> draftNodeIdByAlias = new LinkedHashMap<>();
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
      int draftNodeIndex = draftNodeById.size();
      String legacyAlias = "node-" + (draftNodeIndex + 1);
      draftNodeById.put(draftNodeId, draftNode);
      legacyAliasByDraftNodeId.put(draftNodeId, legacyAlias);
      draftNodeIdByAlias.put(draftNodeId, draftNodeId);
      draftNodeIdByAlias.putIfAbsent(legacyAlias, draftNodeId);
    }

    Diagram diagram =
        findByIdentity(diagramId)
            .orElseThrow(
                () ->
                    new Project.Diagrams.InvalidDraftException("Diagram not found: " + diagramId));

    List<Project.Diagrams.DraftNode> sortedDraftNodes =
        sortDraftNodesByParent(requestedNodes, draftNodeById, draftNodeIdByAlias);
    Map<String, String> createdNodeIdByRef = new LinkedHashMap<>();
    for (Project.Diagrams.DraftNode draftNode : sortedDraftNodes) {
      String draftNodeId = draftNode.id();
      NodeDescription resolvedDescription =
          resolveParentNodeId(draftNode.description(), createdNodeIdByRef, draftNodeIdByAlias);
      DiagramNode createdNode = diagram.addNode(resolvedDescription);
      String createdNodeId = createdNode.getIdentity();
      if (createdNodeId == null || createdNodeId.isBlank()) {
        throw new Project.Diagrams.InvalidDraftException("Created node id must not be blank.");
      }
      createdNodeIdByRef.put(draftNodeId, createdNodeId);
      // Backward compatibility with older indexed placeholder references.
      createdNodeIdByRef.put(legacyAliasByDraftNodeId.get(draftNodeId), createdNodeId);
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

    diagram.addEdges(edgeDescriptions);
    mapper.updateDiagramStatus(projectId, Integer.parseInt(diagramId), Status.DRAFT);
  }

  private static List<Project.Diagrams.DraftNode> sortDraftNodesByParent(
      List<Project.Diagrams.DraftNode> requestedNodes,
      Map<String, Project.Diagrams.DraftNode> draftNodeById,
      Map<String, String> draftNodeIdByAlias) {
    List<Project.Diagrams.DraftNode> sortedNodes = new ArrayList<>(requestedNodes.size());
    Map<String, Integer> visitStateByNodeId = new LinkedHashMap<>();
    for (Project.Diagrams.DraftNode draftNode : requestedNodes) {
      visitDraftNode(
          draftNode.id(), draftNodeById, draftNodeIdByAlias, visitStateByNodeId, sortedNodes);
    }
    return sortedNodes;
  }

  private static void visitDraftNode(
      String draftNodeId,
      Map<String, Project.Diagrams.DraftNode> draftNodeById,
      Map<String, String> draftNodeIdByAlias,
      Map<String, Integer> visitStateByNodeId,
      List<Project.Diagrams.DraftNode> sortedNodes) {
    int visitState = visitStateByNodeId.getOrDefault(draftNodeId, 0);
    if (visitState == 2) {
      return;
    }
    if (visitState == 1) {
      throw new Project.Diagrams.InvalidDraftException(
          "Cyclic parent reference detected: " + draftNodeId);
    }
    Project.Diagrams.DraftNode draftNode = draftNodeById.get(draftNodeId);
    if (draftNode == null) {
      throw new Project.Diagrams.InvalidDraftException(
          "Unknown node placeholder id: " + draftNodeId);
    }

    visitStateByNodeId.put(draftNodeId, 1);
    String parentId =
        readRefId(draftNode.description().parent(), "Node parent id must not be blank.");
    if (parentId != null) {
      String parentDraftNodeId = draftNodeIdByAlias.get(parentId);
      if (parentDraftNodeId != null) {
        visitDraftNode(
            parentDraftNodeId, draftNodeById, draftNodeIdByAlias, visitStateByNodeId, sortedNodes);
      } else if (parentId.matches("node-\\d+")) {
        throw new Project.Diagrams.InvalidDraftException(
            "Unknown node placeholder id: " + parentId);
      }
    }
    visitStateByNodeId.put(draftNodeId, 2);
    sortedNodes.add(draftNode);
  }

  private static NodeDescription resolveParentNodeId(
      NodeDescription description,
      Map<String, String> createdNodeIdByRef,
      Map<String, String> draftNodeIdByAlias) {
    String parentId = readRefId(description.parent(), "Node parent id must not be blank.");
    if (parentId == null) {
      return description;
    }

    String resolvedParentId = createdNodeIdByRef.get(parentId);
    if (resolvedParentId == null) {
      if (draftNodeIdByAlias.containsKey(parentId)) {
        throw new Project.Diagrams.InvalidDraftException(
            "Parent node must be created before child node: " + parentId);
      }
      if (parentId.matches("node-\\d+")) {
        throw new Project.Diagrams.InvalidDraftException(
            "Unknown node placeholder id: " + parentId);
      }
      resolvedParentId = parentId;
    }

    return new NodeDescription(
        description.type(),
        description.logicalEntity(),
        new Ref<>(resolvedParentId),
        description.positionX(),
        description.positionY(),
        description.width(),
        description.height(),
        description.styleConfig(),
        description.localData());
  }

  private static String readRefId(Ref<String> nodeRef, String blankIdMessage) {
    if (nodeRef == null || nodeRef.id() == null) {
      return null;
    }
    if (nodeRef.id().isBlank()) {
      throw new Project.Diagrams.InvalidDraftException(blankIdMessage);
    }
    return nodeRef.id();
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
