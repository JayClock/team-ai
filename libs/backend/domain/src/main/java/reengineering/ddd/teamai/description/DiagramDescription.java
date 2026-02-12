package reengineering.ddd.teamai.description;

import java.util.List;
import reengineering.ddd.teamai.model.DiagramType;

public record DiagramDescription(String title, DiagramType type, Viewport viewport) {
  public static record DraftDiagram(
      List<NodeDescription.DraftNode> nodes, List<EdgeDescription.DraftEdge> edges) {}
}
