package reengineering.ddd.teamai.api.acp;

import java.util.concurrent.atomic.AtomicLong;
import org.springframework.stereotype.Component;

@Component
public class AcpEventIdGenerator {
  private final AtomicLong sequence = new AtomicLong(0);

  public String next(String sessionId, String eventType) {
    String normalizedSessionId =
        sessionId == null || sessionId.isBlank() ? "unknown" : sessionId.trim();
    String normalizedType =
        eventType == null || eventType.isBlank() ? "event" : eventType.trim().toLowerCase();
    long id = sequence.incrementAndGet();
    return "acp-%s-%s-%d".formatted(normalizedSessionId, normalizedType, id);
  }
}
