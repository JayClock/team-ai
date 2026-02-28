package reengineering.ddd.teamai.mybatis.associations;

import jakarta.inject.Inject;
import java.util.ArrayDeque;
import java.util.ArrayList;
import java.util.Collection;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.function.Function;
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
  private static final String NEW_NODE_PLACEHOLDER_PATTERN = "node-\\d+";

  private int diagramId;

  @Inject private DiagramNodesMapper mapper;

  @Override
  @Cacheable(value = CACHE_NAME, key = "#root.target.diagramId")
  protected List<DiagramNode> findEntities(int from, int to) {
    return sortPersistedNodesByParent(mapper.findNodesByDiagramId(diagramId));
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
    deleteMissingPersistedNodes(requestedNodes);
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
      validateDraftNodeIdentityFormat(draftNodeId);
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
      String persistedNodeId = commitNodeByDraftId(draftNodeId, resolvedDescription);
      createdNodeIdByRef.put(draftNodeId, persistedNodeId);
      // Backward compatibility with older indexed placeholder references.
      String legacyAlias = legacyAliasByDraftNodeId.get(draftNodeId);
      if (legacyAlias != null) {
        createdNodeIdByRef.putIfAbsent(legacyAlias, persistedNodeId);
      }
    }
    return createdNodeIdByRef;
  }

  private String commitNodeByDraftId(String draftNodeId, NodeDescription resolvedDescription) {
    if (isNewNodePlaceholderId(draftNodeId)) {
      DiagramNode createdNode = add(resolvedDescription);
      String createdNodeId = createdNode.getIdentity();
      if (createdNodeId == null || createdNodeId.isBlank()) {
        throw new Project.Diagrams.InvalidDraftException("Created node id must not be blank.");
      }
      return createdNodeId;
    }
    return updateExistingNodeById(draftNodeId, resolvedDescription);
  }

  private String updateExistingNodeById(String draftNodeId, NodeDescription resolvedDescription) {
    int persistedNodeId = parsePersistedNodeId(draftNodeId);
    int affectedRows = mapper.updateNode(diagramId, persistedNodeId, resolvedDescription);
    if (affectedRows == 0) {
      throw new Project.Diagrams.InvalidDraftException("Node not found: " + draftNodeId);
    }
    DiagramNode updatedNode = findEntity(draftNodeId);
    if (updatedNode == null
        || updatedNode.getIdentity() == null
        || updatedNode.getIdentity().isBlank()) {
      throw new Project.Diagrams.InvalidDraftException(
          "Updated node id must not be blank: " + draftNodeId);
    }
    return updatedNode.getIdentity();
  }

  private void deleteMissingPersistedNodes(List<Project.Diagrams.DraftNode> requestedNodes) {
    Set<Integer> incomingExistingNodeIds = extractIncomingExistingNodeIds(requestedNodes);
    List<Integer> nodeIdsToDelete = new ArrayList<>();
    for (DiagramNode persistedNode : mapper.findNodesByDiagramId(diagramId)) {
      if (persistedNode == null || persistedNode.getIdentity() == null) {
        continue;
      }
      int persistedNodeId = parsePersistedNodeId(persistedNode.getIdentity());
      if (!incomingExistingNodeIds.contains(persistedNodeId)) {
        nodeIdsToDelete.add(persistedNodeId);
      }
    }
    if (!nodeIdsToDelete.isEmpty()) {
      mapper.deleteNodesByIds(diagramId, nodeIdsToDelete);
    }
  }

  private static Set<Integer> extractIncomingExistingNodeIds(
      List<Project.Diagrams.DraftNode> requestedNodes) {
    Set<Integer> incomingExistingNodeIds = new HashSet<>();
    for (Project.Diagrams.DraftNode draftNode : requestedNodes) {
      String draftNodeId = draftNode.id();
      if (!isNewNodePlaceholderId(draftNodeId)) {
        incomingExistingNodeIds.add(parsePersistedNodeId(draftNodeId));
      }
    }
    return incomingExistingNodeIds;
  }

  private static List<Project.Diagrams.DraftNode> sortDraftNodesByParent(
      List<Project.Diagrams.DraftNode> requestedNodes,
      Map<String, Project.Diagrams.DraftNode> draftNodeById,
      Map<String, String> draftNodeIdByAlias) {
    List<String> orderedDraftNodeIds = new ArrayList<>(requestedNodes.size());
    Map<String, String> parentDraftNodeIdByDraftNodeId = new LinkedHashMap<>(requestedNodes.size());
    for (Project.Diagrams.DraftNode draftNode : requestedNodes) {
      String draftNodeId = draftNode.id();
      orderedDraftNodeIds.add(draftNodeId);
      String parentId =
          readRefId(draftNode.description().parent(), "Node parent id must not be blank.");
      if (parentId == null) {
        parentDraftNodeIdByDraftNodeId.put(draftNodeId, null);
        continue;
      }
      String parentDraftNodeId = draftNodeIdByAlias.get(parentId);
      if (parentDraftNodeId != null) {
        parentDraftNodeIdByDraftNodeId.put(draftNodeId, parentDraftNodeId);
      } else if (parentId.matches(NEW_NODE_PLACEHOLDER_PATTERN)) {
        throw new Project.Diagrams.InvalidDraftException(
            "Unknown node placeholder id: " + parentId);
      } else {
        parentDraftNodeIdByDraftNodeId.put(draftNodeId, null);
      }
    }

    List<String> sortedDraftNodeIds =
        sortNodeIdsByParentDependency(
            orderedDraftNodeIds,
            parentDraftNodeIdByDraftNodeId,
            unresolvedNodeIds ->
                new Project.Diagrams.InvalidDraftException(
                    "Cyclic parent reference detected: " + unresolvedNodeIds.get(0)));

    List<Project.Diagrams.DraftNode> sortedNodes = new ArrayList<>(sortedDraftNodeIds.size());
    for (String sortedDraftNodeId : sortedDraftNodeIds) {
      Project.Diagrams.DraftNode draftNode = draftNodeById.get(sortedDraftNodeId);
      if (draftNode == null) {
        throw new Project.Diagrams.InvalidDraftException(
            "Unknown node placeholder id: " + sortedDraftNodeId);
      }
      sortedNodes.add(draftNode);
    }
    return List.copyOf(sortedNodes);
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
      if (isNewNodePlaceholderId(parentId)) {
        throw new Project.Diagrams.InvalidDraftException(
            "Unknown node placeholder id: " + parentId);
      }
      validatePersistedNodeId(parentId);
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

  private static void validateDraftNodeIdentityFormat(String draftNodeId) {
    if (isNewNodePlaceholderId(draftNodeId)) {
      return;
    }
    validatePersistedNodeId(draftNodeId);
  }

  private static void validatePersistedNodeId(String nodeId) {
    parsePersistedNodeId(nodeId);
  }

  private static int parsePersistedNodeId(String nodeId) {
    try {
      return Integer.parseInt(nodeId);
    } catch (NumberFormatException error) {
      throw new Project.Diagrams.InvalidDraftException(
          "Existing node id must be numeric: " + nodeId);
    }
  }

  private static List<DiagramNode> sortPersistedNodesByParent(List<DiagramNode> nodes) {
    if (nodes == null || nodes.size() < 2) {
      return nodes == null ? List.of() : List.copyOf(nodes);
    }

    Map<String, DiagramNode> nodeById = new LinkedHashMap<>(nodes.size());
    Map<String, String> parentNodeIdByNodeId = new LinkedHashMap<>(nodes.size());
    List<String> orderedNodeIds = new ArrayList<>(nodes.size());

    for (DiagramNode node : nodes) {
      String nodeId = readPersistedNodeId(node);
      if (nodeById.putIfAbsent(nodeId, node) != null) {
        throw new IllegalStateException("Duplicated persisted node id: " + nodeId);
      }
      orderedNodeIds.add(nodeId);
      parentNodeIdByNodeId.put(nodeId, null);
    }

    for (DiagramNode node : nodes) {
      String nodeId = readPersistedNodeId(node);
      String parentId = readPersistedParentId(node);
      if (parentId == null) {
        continue;
      }
      if (!nodeById.containsKey(parentId)) {
        throw new IllegalStateException(
            "Parent node not found for node " + nodeId + ": " + parentId);
      }
      parentNodeIdByNodeId.put(nodeId, parentId);
    }

    List<String> sortedNodeIds =
        sortNodeIdsByParentDependency(
            orderedNodeIds,
            parentNodeIdByNodeId,
            unresolvedNodeIds ->
                new IllegalStateException(
                    "Cyclic parent reference detected in persisted nodes: "
                        + String.join(", ", unresolvedNodeIds)));

    List<DiagramNode> sortedNodes = new ArrayList<>(sortedNodeIds.size());
    for (String sortedNodeId : sortedNodeIds) {
      sortedNodes.add(nodeById.get(sortedNodeId));
    }
    return List.copyOf(sortedNodes);
  }

  private static <E extends RuntimeException> List<String> sortNodeIdsByParentDependency(
      List<String> orderedNodeIds,
      Map<String, String> parentNodeIdByNodeId,
      Function<List<String>, E> cycleExceptionFactory) {
    Map<String, Integer> indegreeByNodeId = new LinkedHashMap<>(orderedNodeIds.size());
    Map<String, List<String>> childIdsByParentId = new LinkedHashMap<>();

    for (String nodeId : orderedNodeIds) {
      indegreeByNodeId.put(nodeId, 0);
    }
    for (String nodeId : orderedNodeIds) {
      String parentNodeId = parentNodeIdByNodeId.get(nodeId);
      if (parentNodeId == null) {
        continue;
      }
      indegreeByNodeId.put(nodeId, indegreeByNodeId.get(nodeId) + 1);
      childIdsByParentId.computeIfAbsent(parentNodeId, key -> new ArrayList<>()).add(nodeId);
    }

    ArrayDeque<String> queue = new ArrayDeque<>();
    for (String nodeId : orderedNodeIds) {
      if (indegreeByNodeId.get(nodeId) == 0) {
        queue.addLast(nodeId);
      }
    }

    List<String> sortedNodeIds = new ArrayList<>(orderedNodeIds.size());
    while (!queue.isEmpty()) {
      String nodeId = queue.removeFirst();
      sortedNodeIds.add(nodeId);

      for (String childId : childIdsByParentId.getOrDefault(nodeId, List.of())) {
        int indegree = indegreeByNodeId.get(childId) - 1;
        indegreeByNodeId.put(childId, indegree);
        if (indegree == 0) {
          queue.addLast(childId);
        }
      }
    }

    if (sortedNodeIds.size() == orderedNodeIds.size()) {
      return List.copyOf(sortedNodeIds);
    }

    List<String> unresolvedNodeIds = new ArrayList<>();
    for (String nodeId : orderedNodeIds) {
      if (indegreeByNodeId.getOrDefault(nodeId, 0) > 0) {
        unresolvedNodeIds.add(nodeId);
      }
    }
    throw cycleExceptionFactory.apply(List.copyOf(unresolvedNodeIds));
  }

  private static String readPersistedNodeId(DiagramNode node) {
    if (node == null || node.getIdentity() == null || node.getIdentity().isBlank()) {
      throw new IllegalStateException("Persisted node id must not be blank.");
    }
    return node.getIdentity();
  }

  private static String readPersistedParentId(DiagramNode node) {
    NodeDescription description = node.getDescription();
    if (description == null || description.parent() == null || description.parent().id() == null) {
      return null;
    }
    String parentId = description.parent().id();
    if (parentId.isBlank()) {
      throw new IllegalStateException(
          "Node parent id must not be blank for node: " + readPersistedNodeId(node));
    }
    return parentId;
  }

  private static boolean isNewNodePlaceholderId(String nodeId) {
    return nodeId != null && nodeId.matches(NEW_NODE_PLACEHOLDER_PATTERN);
  }

  private record DraftNodeMappings(
      Map<String, Project.Diagrams.DraftNode> draftNodeById,
      Map<String, String> legacyAliasByDraftNodeId,
      Map<String, String> draftNodeIdByAlias) {}
}
