package reengineering.ddd.teamai.model;

import java.util.ArrayList;
import java.util.Collection;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import reactor.core.publisher.Flux;
import reengineering.ddd.archtype.Entity;
import reengineering.ddd.archtype.HasMany;
import reengineering.ddd.archtype.Ref;
import reengineering.ddd.teamai.description.DiagramDescription;
import reengineering.ddd.teamai.description.EdgeDescription;
import reengineering.ddd.teamai.description.NodeDescription;

public class Diagram implements Entity<String, DiagramDescription> {
  private String identity;
  private DiagramDescription description;
  private Nodes nodes;
  private Edges edges;

  public Diagram(String identity, DiagramDescription description, Nodes nodes, Edges edges) {
    this.identity = identity;
    this.description = description;
    this.nodes = nodes;
    this.edges = edges;
  }

  private Diagram() {}

  @Override
  public String getIdentity() {
    return identity;
  }

  @Override
  public DiagramDescription getDescription() {
    return description;
  }

  public HasMany<String, DiagramNode> nodes() {
    return nodes;
  }

  public HasMany<String, DiagramEdge> edges() {
    return edges;
  }

  public DiagramNode addNode(NodeDescription description) {
    return nodes.add(description);
  }

  public DiagramEdge addEdge(EdgeDescription description) {
    return edges.add(description);
  }

  public CommitDraftResult commitDraft(
      Collection<DraftNode> draftNodes, Collection<DraftEdge> draftEdges) {
    List<DraftNode> requestedNodes = draftNodes == null ? List.of() : List.copyOf(draftNodes);
    List<DraftEdge> requestedEdges = draftEdges == null ? List.of() : List.copyOf(draftEdges);

    List<String> draftNodeIds = new ArrayList<>(requestedNodes.size());
    List<NodeDescription> nodeDescriptions = new ArrayList<>(requestedNodes.size());
    for (DraftNode draftNode : requestedNodes) {
      if (draftNode == null || draftNode.description() == null) {
        throw new InvalidDraftException("Node request must provide description.");
      }
      String draftNodeId = draftNode.id();
      if (draftNodeId == null || draftNodeId.isBlank()) {
        throw new InvalidDraftException("Node request must provide id.");
      }
      draftNodeIds.add(draftNodeId);
      nodeDescriptions.add(draftNode.description());
    }

    List<DiagramNode> createdNodes =
        nodeDescriptions.isEmpty() ? List.of() : nodes.addAll(nodeDescriptions);

    Map<String, String> createdNodeIdByRef = new LinkedHashMap<>();
    for (int index = 0; index < createdNodes.size(); index += 1) {
      DiagramNode createdNode = createdNodes.get(index);
      String createdNodeId = createdNode.getIdentity();
      String draftNodeId = draftNodeIds.get(index);

      createdNodeIdByRef.put(draftNodeId, createdNodeId);
      // Backward compatibility with older indexed placeholder references.
      createdNodeIdByRef.put("node-" + (index + 1), createdNodeId);
    }

    List<EdgeDescription> edgeDescriptions = new ArrayList<>(requestedEdges.size());
    for (DraftEdge draftEdge : requestedEdges) {
      if (draftEdge == null) {
        throw new InvalidDraftException("Edge request must provide nodeId.");
      }
      String sourceNodeId = resolveNodeId(draftEdge.sourceNodeId(), createdNodeIdByRef);
      String targetNodeId = resolveNodeId(draftEdge.targetNodeId(), createdNodeIdByRef);
      edgeDescriptions.add(
          new EdgeDescription(
              new Ref<>(sourceNodeId), new Ref<>(targetNodeId), null, null, null, null, null));
    }

    List<DiagramEdge> createdEdges =
        edgeDescriptions.isEmpty() ? List.of() : edges.addAll(edgeDescriptions);

    return new CommitDraftResult(createdNodes, createdEdges);
  }

  private static String resolveNodeId(String nodeId, Map<String, String> createdNodeIdByRef) {
    if (nodeId == null || nodeId.isBlank()) {
      throw new InvalidDraftException("Edge request must provide nodeId.");
    }
    String resolvedId = createdNodeIdByRef.get(nodeId);
    if (resolvedId != null) {
      return resolvedId;
    }
    if (nodeId.matches("node-\\d+")) {
      throw new InvalidDraftException("Unknown node placeholder id: " + nodeId);
    }
    return nodeId;
  }

  public record CommitDraftResult(List<DiagramNode> nodes, List<DiagramEdge> edges) {
    public CommitDraftResult {
      nodes = nodes == null ? List.of() : List.copyOf(nodes);
      edges = edges == null ? List.of() : List.copyOf(edges);
    }
  }

  public record DraftNode(String id, NodeDescription description) {}

  public record DraftEdge(String sourceNodeId, String targetNodeId) {}

  public static class InvalidDraftException extends RuntimeException {
    public InvalidDraftException(String message) {
      super(message);
    }
  }

  public interface Nodes extends HasMany<String, DiagramNode> {
    DiagramNode add(NodeDescription description);

    List<DiagramNode> addAll(Collection<NodeDescription> descriptions);
  }

  public interface Edges extends HasMany<String, DiagramEdge> {
    DiagramEdge add(EdgeDescription description);

    List<DiagramEdge> addAll(Collection<EdgeDescription> descriptions);
  }

  public Flux<String> proposeModel(String requirement, DomainArchitect architect) {
    return architect.proposeModel(requirement);
  }

  public interface DomainArchitect {
    Flux<String> proposeModel(String requirement);
  }
}
