package reengineering.ddd.teamai.description;

import reengineering.ddd.archtype.JsonBlob;
import reengineering.ddd.archtype.Ref;

public record EdgeDescription(
    Ref<String> sourceNode,
    Ref<String> targetNode,
    String sourceHandle,
    String targetHandle,
    String relationType,
    String label,
    JsonBlob styleProps) {

  public static record DraftEdge(Ref<String> sourceNode, Ref<String> targetNode) {}
}
