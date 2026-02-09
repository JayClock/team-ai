package com.businessdrivenai.domain.description;

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
    for (ContextSubType type : values()) {
      if (type.value.equals(value)) {
        return type;
      }
    }
    throw new IllegalArgumentException("Unknown context sub-type: " + value);
  }
}
