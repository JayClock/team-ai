package reengineering.ddd.teamai.description;

/**
 * Sub-types for Role entities in Fulfillment Modeling. Represents abstract roles that can be played
 * by concrete participants.
 */
public enum RoleSubType implements LogicalEntityDescription.SubType {
  PARTY_ROLE("party_role"),
  DOMAIN_LOGIC_ROLE("domain_logic_role"),
  THIRD_PARTY_ROLE("third_party_role"),
  CONTEXT_ROLE("context_role"),
  EVIDENCE_ROLE("evidence_role");

  private final String value;

  RoleSubType(String value) {
    this.value = value;
  }

  @Override
  public String getValue() {
    return value;
  }

  public static RoleSubType fromValue(String value) {
    for (RoleSubType type : values()) {
      if (type.value.equals(value)) {
        return type;
      }
    }
    throw new IllegalArgumentException("Unknown role sub-type: " + value);
  }
}
