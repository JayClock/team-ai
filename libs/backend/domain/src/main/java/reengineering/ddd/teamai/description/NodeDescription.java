package reengineering.ddd.teamai.description;

import reengineering.ddd.archtype.Ref;

public record NodeDescription(
    String type,
    Ref<String> logicalEntity,
    Ref<String> parent,
    double positionX,
    double positionY,
    Integer width,
    Integer height,
    NodeStyleConfig styleConfig,
    LocalNodeData localData) {}
