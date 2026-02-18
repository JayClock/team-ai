package reengineering.ddd.teamai.model;

public enum DiagramStatus {
  DRAFT("draft"),
  PUBLISHED("published");

  private final String value;

  DiagramStatus(String value) {
    this.value = value;
  }

  public String getValue() {
    return value;
  }

  public static DiagramStatus fromValue(String value) {
    for (DiagramStatus status : values()) {
      if (status.value.equals(value)) {
        return status;
      }
    }
    throw new IllegalArgumentException("Unknown diagram status: " + value);
  }
}
