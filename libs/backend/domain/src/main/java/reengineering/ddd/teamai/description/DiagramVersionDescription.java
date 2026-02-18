package reengineering.ddd.teamai.description;

import java.util.List;

public record DiagramVersionDescription(String name, DiagramSnapshot snapshot) {
  public record DiagramSnapshot(
      List<SnapshotNode> nodes, List<SnapshotEdge> edges, Viewport viewport) {
    public DiagramSnapshot {
      nodes = nodes == null ? List.of() : List.copyOf(nodes);
      edges = edges == null ? List.of() : List.copyOf(edges);
    }

    public record SnapshotNode(String id, NodeDescription description) {}

    public record SnapshotEdge(String id, EdgeDescription description) {}
  }
}
