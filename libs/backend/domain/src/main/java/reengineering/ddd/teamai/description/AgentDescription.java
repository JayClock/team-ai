package reengineering.ddd.teamai.description;

import reengineering.ddd.archtype.Ref;

public record AgentDescription(
    String name, Role role, String modelTier, Status status, Ref<String> parent, String prompt) {
  public AgentDescription(
      String name, Role role, String modelTier, Status status, Ref<String> parent) {
    this(name, role, modelTier, status, parent, null);
  }

  public enum Role {
    ROUTA,
    CRAFTER,
    GATE,
    DEVELOPER,
    SPECIALIST
  }

  public enum Status {
    PENDING,
    ACTIVE,
    COMPLETED,
    ERROR,
    CANCELLED
  }
}
