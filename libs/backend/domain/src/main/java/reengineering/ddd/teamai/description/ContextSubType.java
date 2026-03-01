package reengineering.ddd.teamai.description;

/**
 * Sub-types for Context entities in Fulfillment Modeling. Represents bounded contexts that separate
 * different business domains.
 */
public enum ContextSubType implements LogicalEntityDescription.SubType {
  BOUNDED_CONTEXT("bounded_context");

  private final String value;

  ContextSubType(String value) {
    this.value = value;
  }

  @Override
  public String getValue() {
    return value;
  }

  public static ContextSubType fromValue(String value) {
    if (value == null) {
      throw new IllegalArgumentException("Unknown context sub-type: " + value);
    }
    for (ContextSubType type : values()) {
      if (type.value.equalsIgnoreCase(value.trim())) {
        return type;
      }
    }
    throw new IllegalArgumentException("Unknown context sub-type: " + value);
  }
}
