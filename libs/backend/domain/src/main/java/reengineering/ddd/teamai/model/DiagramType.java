package reengineering.ddd.teamai.model;

public enum DiagramType {
  FLOWCHART("flowchart"),
  SEQUENCE("sequence"),
  CLASS("class"),
  COMPONENT("component"),
  STATE("state"),
  ACTIVITY("activity");

  private final String value;

  DiagramType(String value) {
    this.value = value;
  }

  public String getValue() {
    return value;
  }

  public static DiagramType fromValue(String value) {
    for (DiagramType type : values()) {
      if (type.value.equals(value)) {
        return type;
      }
    }
    throw new IllegalArgumentException("Unknown diagram type: " + value);
  }
}
