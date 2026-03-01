package reengineering.ddd.teamai.description;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;

import org.junit.jupiter.api.Test;

public class SubTypeParsingTest {
  @Test
  void should_parse_participant_sub_type_case_insensitively() {
    assertEquals(ParticipantSubType.PARTY, ParticipantSubType.fromValue("PARTY"));
    assertEquals(ParticipantSubType.THING, ParticipantSubType.fromValue(" thing "));
  }

  @Test
  void should_parse_evidence_sub_type_case_insensitively() {
    assertEquals(EvidenceSubType.RFP, EvidenceSubType.fromValue("RFP"));
    assertEquals(
        EvidenceSubType.FULFILLMENT_CONFIRMATION,
        EvidenceSubType.fromValue(" fulfillment_confirmation "));
  }

  @Test
  void should_parse_role_sub_type_case_insensitively() {
    assertEquals(RoleSubType.PARTY_ROLE, RoleSubType.fromValue("PARTY_ROLE"));
    assertEquals(RoleSubType.CONTEXT_ROLE, RoleSubType.fromValue(" context_role "));
  }

  @Test
  void should_parse_context_sub_type_case_insensitively() {
    assertEquals(ContextSubType.BOUNDED_CONTEXT, ContextSubType.fromValue("BOUNDED_CONTEXT"));
  }

  @Test
  void should_reject_unknown_sub_type_values() {
    assertThrows(IllegalArgumentException.class, () -> ParticipantSubType.fromValue("unknown"));
    assertThrows(IllegalArgumentException.class, () -> EvidenceSubType.fromValue("unknown"));
    assertThrows(IllegalArgumentException.class, () -> RoleSubType.fromValue("unknown"));
    assertThrows(IllegalArgumentException.class, () -> ContextSubType.fromValue("unknown"));
  }
}
