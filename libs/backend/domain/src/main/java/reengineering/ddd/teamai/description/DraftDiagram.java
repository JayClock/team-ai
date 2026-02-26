package reengineering.ddd.teamai.description;

import java.util.List;
import reengineering.ddd.archtype.Ref;

public record DraftDiagram(List<DraftNode> nodes, List<DraftEdge> edges) {
  public static record DraftNode(String id, Ref<String> parent, DraftEntity localData) {}

  public static record DraftEdge(Ref<String> sourceNode, Ref<String> targetNode) {}

  public static record DraftEntity(
      String name,
      String label,
      LogicalEntityDescription.Type type,
      String subType) {}
}
