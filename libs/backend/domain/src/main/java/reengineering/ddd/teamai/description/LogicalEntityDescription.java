package reengineering.ddd.teamai.description;

import reengineering.ddd.archtype.Ref;

public record LogicalEntityDescription(
    String type,
    String name,
    String label,
    EntityDefinition definition,
    String status,
    Ref<String> project) {}
