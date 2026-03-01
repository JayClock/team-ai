package reengineering.ddd.teamai.model;

import java.util.List;

public record KnowledgeGraph(String projectId, List<Node> nodes, List<Edge> edges) {
  public record Node(
      String logicalEntityId,
      String type,
      String subType,
      String name,
      String label,
      String description) {}

  public record Edge(
      String diagramId,
      String sourceLogicalEntityId,
      String targetLogicalEntityId,
      String relationType) {}
}
