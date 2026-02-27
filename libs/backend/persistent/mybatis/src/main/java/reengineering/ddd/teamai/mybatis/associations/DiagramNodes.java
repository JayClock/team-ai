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
import reengineering.ddd.archtype.Ref;
import reengineering.ddd.mybatis.database.EntityList;
import reengineering.ddd.mybatis.support.IdHolder;
import reengineering.ddd.teamai.description.NodeDescription;
import reengineering.ddd.teamai.model.Diagram;
import reengineering.ddd.teamai.model.DiagramNode;
import reengineering.ddd.teamai.model.Project;
import reengineering.ddd.teamai.mybatis.cache.AssociationMapping;
import reengineering.ddd.teamai.mybatis.mappers.DiagramNodesMapper;

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

  @Override
  @CacheEvict(value = CACHE_NAME, key = "#root.target.diagramId + '*")
  public List<DiagramNode> addAll(Collection<NodeDescription> descriptions) {
    if (descriptions == null || descriptions.isEmpty()) {
      return List.of();
    }

    List<DiagramNode> createdNodes = new ArrayList<>(descriptions.size());
    for (NodeDescription description : descriptions) {
      IdHolder idHolder = new IdHolder();
      mapper.insertNode(idHolder, diagramId, description);
      createdNodes.add(findEntity(String.valueOf(idHolder.id())));
    }
    return List.copyOf(createdNodes);
  }

  @CacheEvict(value = CACHE_NAME, key = "#root.target.diagramId + '*")
  public Map<String, String> commitDraftNodes(Collection<Project.Diagrams.DraftNode> draftNodes) {
    List<Project.Diagrams.DraftNode> requestedNodes =
        draftNodes == null ? List.of() : List.copyOf(draftNodes);
    DraftNodeMappings mappings = buildDraftNodeMappings(requestedNodes);
    List<Project.Diagrams.DraftNode> sortedDraftNodes =
        sortDraftNodesByParent(
            requestedNodes, mappings.draftNodeById(), mappings.draftNodeIdByAlias());
    return createDraftNodes(
        sortedDraftNodes, mappings.draftNodeIdByAlias(), mappings.legacyAliasByDraftNodeId());
  }

  @CacheEvict(value = CACHE_NAME, key = "#root.target.diagramId + '*")
  public void promoteNodeLocalDataToLogicalEntitiesForPublish(int projectId) {
    List<Integer> nodeIds = mapper.findNodeIdsWithoutLogicalEntityForPublish(projectId, diagramId);
    for (Integer nodeId : nodeIds) {
      if (nodeId != null) {
        mapper.promoteNodeLocalDataToLogicalEntity(projectId, diagramId, nodeId);
      }
    }
  }

  private static DraftNodeMappings buildDraftNodeMappings(
      List<Project.Diagrams.DraftNode> requestedNodes) {
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
    return new DraftNodeMappings(draftNodeById, legacyAliasByDraftNodeId, draftNodeIdByAlias);
  }

  private Map<String, String> createDraftNodes(
      List<Project.Diagrams.DraftNode> sortedDraftNodes,
      Map<String, String> draftNodeIdByAlias,
      Map<String, String> legacyAliasByDraftNodeId) {
    Map<String, String> createdNodeIdByRef = new LinkedHashMap<>();
    for (Project.Diagrams.DraftNode draftNode : sortedDraftNodes) {
      String draftNodeId = draftNode.id();
      NodeDescription resolvedDescription =
          resolveParentNodeId(draftNode.description(), createdNodeIdByRef, draftNodeIdByAlias);
      DiagramNode createdNode = add(resolvedDescription);
      String createdNodeId = createdNode.getIdentity();
      if (createdNodeId == null || createdNodeId.isBlank()) {
        throw new Project.Diagrams.InvalidDraftException("Created node id must not be blank.");
      }
      createdNodeIdByRef.put(draftNodeId, createdNodeId);
      // Backward compatibility with older indexed placeholder references.
      createdNodeIdByRef.put(legacyAliasByDraftNodeId.get(draftNodeId), createdNodeId);
    }
    return createdNodeIdByRef;
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

  private record DraftNodeMappings(
      Map<String, Project.Diagrams.DraftNode> draftNodeById,
      Map<String, String> legacyAliasByDraftNodeId,
      Map<String, String> draftNodeIdByAlias) {}
}
