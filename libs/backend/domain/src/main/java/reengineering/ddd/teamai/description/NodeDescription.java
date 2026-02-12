package reengineering.ddd.teamai.description;

import reengineering.ddd.archtype.JsonBlob;
import reengineering.ddd.archtype.Ref;
import reengineering.ddd.teamai.description.NodeDescription.DraftEntity;

public record NodeDescription(
    String type,
    Ref<String> logicalEntity,
    Ref<String> parent,
    double positionX,
    double positionY,
    Integer width,
    Integer height,
    JsonBlob styleConfig,
    JsonBlob localData) {
  public static record DraftNode(DraftEntity localData) {}

  public static record DraftEntity(String name, String label, LogicalEntityDescription.Type type) {}
}
