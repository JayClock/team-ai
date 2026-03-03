package reengineering.ddd.teamai.api.acp;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

import org.junit.jupiter.api.Test;

class AcpEventIdGeneratorTest {
  @Test
  void should_generate_monotonic_session_scoped_event_ids() {
    AcpEventIdGenerator generator = new AcpEventIdGenerator();

    String first = generator.next("session-1", AcpEventEnvelope.TYPE_STATUS);
    String second = generator.next("session-1", AcpEventEnvelope.TYPE_STATUS);

    assertTrue(first.startsWith("acp-session-1-status-"));
    assertTrue(second.startsWith("acp-session-1-status-"));
    int firstSeq = Integer.parseInt(first.substring(first.lastIndexOf('-') + 1));
    int secondSeq = Integer.parseInt(second.substring(second.lastIndexOf('-') + 1));
    assertEquals(firstSeq + 1, secondSeq);
  }
}
