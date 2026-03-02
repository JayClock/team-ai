package reengineering.ddd.teamai.description;

import reengineering.ddd.archtype.Ref;

public record AgentDescription(
    String name, Role role, String modelTier, Status status, Ref<String> parent) {

  public enum Role {
    ROUTA,
    CRAFTER,
    GATE,
    DEVELOPER
  }

  public enum Status {
    PENDING,
    ACTIVE,
    COMPLETED,
    ERROR,
    CANCELLED
  }
}
