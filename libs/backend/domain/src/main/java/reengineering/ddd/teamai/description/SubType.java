package reengineering.ddd.teamai.description;

/**
 * Sealed interface for LogicalEntity sub-types in Fulfillment Modeling. Each entity type (Evidence,
 * Participant, Role, Context) has its own sub-type enum.
 */
public sealed interface SubType
    permits EvidenceSubType, ParticipantSubType, RoleSubType, ContextSubType {
  String getValue();
}
