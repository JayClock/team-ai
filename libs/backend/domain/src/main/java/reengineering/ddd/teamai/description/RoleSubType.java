package reengineering.ddd.teamai.description;

/**
 * Sub-types for Role entities in Fulfillment Modeling. Represents abstract roles that can be played
 * by concrete participants.
 */
public enum RoleSubType implements LogicalEntityDescription.SubType {
  PARTY("party"),
  DOMAIN("domain"),
  THIRD_PARTY_SYSTEM("3rd system"),
  OTHER_CONTEXT("context"),
  EVIDENCE("evidence");

  private final String value;

  RoleSubType(String value) {
    this.value = value;
  }

  @Override
  public String getValue() {
    return value;
  }

  public static RoleSubType fromValue(String value) {
    if (value == null) {
      throw new IllegalArgumentException("Unknown role sub-type: " + value);
    }
    String trimmed = value.trim();
    if (trimmed.isEmpty()) {
      throw new IllegalArgumentException("Unknown role sub-type: " + value);
    }
    for (RoleSubType type : values()) {
      if (type.value.equalsIgnoreCase(trimmed)) {
        return type;
      }
    }
    throw new IllegalArgumentException("Unknown role sub-type: " + value);
  }
}
