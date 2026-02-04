package reengineering.ddd.teamai.description;

public record EntityAttribute(
    String id,
    String name,
    String label,
    String type,
    String description,
    boolean isBusinessKey,
    boolean relation,
    String visibility) {}
