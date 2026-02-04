package reengineering.ddd.teamai.description;

import java.util.List;

public record EntityDefinition(
    String description,
    List<String> tags,
    List<EntityAttribute> attributes,
    List<EntityBehavior> behaviors) {}
