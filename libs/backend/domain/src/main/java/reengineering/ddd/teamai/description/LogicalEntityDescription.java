package reengineering.ddd.teamai.description;

public record LogicalEntityDescription(
    Type type, SubType subType, String name, String label, EntityDefinition definition) {

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

  /**
   * Sealed interface for LogicalEntity sub-types in Fulfillment Modeling. Each entity type
   * (Evidence, Participant, Role, Context) has its own sub-type enum.
   */
  public sealed interface SubType
      permits EvidenceSubType, ParticipantSubType, RoleSubType, ContextSubType {
    String getValue();
  }
}
