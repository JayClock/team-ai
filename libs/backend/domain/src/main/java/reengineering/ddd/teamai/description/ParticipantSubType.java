package reengineering.ddd.teamai.description;

/**
 * Sub-types for Participant entities in Fulfillment Modeling. Represents the parties and things
 * involved in a business contract.
 */
public enum ParticipantSubType implements LogicalEntityDescription.SubType {
  PARTY("party"),
  THING("thing");

  private final String value;

  ParticipantSubType(String value) {
    this.value = value;
  }

  @Override
  public String getValue() {
    return value;
  }

  public static ParticipantSubType fromValue(String value) {
    for (ParticipantSubType type : values()) {
      if (type.value.equals(value)) {
        return type;
      }
    }
    throw new IllegalArgumentException("Unknown participant sub-type: " + value);
  }
}
