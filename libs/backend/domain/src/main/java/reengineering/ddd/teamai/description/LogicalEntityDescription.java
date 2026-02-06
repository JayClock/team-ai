package reengineering.ddd.teamai.description;

import reengineering.ddd.archtype.Ref;

public record LogicalEntityDescription(
    Type type,
    String name,
    String label,
    EntityDefinition definition,
    String status,
    Ref<String> project) {

  public enum Type {
    EVIDENCE("Evidence"),
    PARTICIPANT("Participant"),
    ROLE("Role"),
    CONTEXT("Context");

    private final String value;

    Type(String value) {
      this.value = value;
    }

    public String getValue() {
      return value;
    }

    public static Type fromValue(String value) {
      for (Type type : values()) {
        if (type.value.equals(value)) {
          return type;
        }
      }
      throw new IllegalArgumentException("Unknown logical entity type: " + value);
    }
  }
}
