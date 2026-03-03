package reengineering.ddd.teamai.api.acp;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import jakarta.ws.rs.sse.OutboundSseEvent;
import jakarta.ws.rs.sse.Sse;
import jakarta.ws.rs.sse.SseEventSink;
import java.time.Instant;
import java.util.Map;
import org.springframework.stereotype.Component;

@Component
public class AcpSseEventWriter {
  private final ObjectMapper objectMapper;
  private final AcpEventIdGenerator eventIdGenerator;

  public AcpSseEventWriter(ObjectMapper objectMapper, AcpEventIdGenerator eventIdGenerator) {
    this.objectMapper = objectMapper;
    this.eventIdGenerator = eventIdGenerator;
  }

  public AcpEventEnvelope envelope(
      String sessionId,
      String eventType,
      Map<String, Object> data,
      AcpEventEnvelope.EventError error) {
    String eventId = eventIdGenerator.next(sessionId, eventType);
    return new AcpEventEnvelope(
        eventId,
        normalizedSessionId(sessionId),
        normalizedType(eventType),
        Instant.now(),
        data == null ? Map.of() : data,
        error);
  }

  public void send(SseEventSink sink, Sse sse, AcpEventEnvelope envelope) {
    try {
      String payload = objectMapper.writeValueAsString(envelope);
      OutboundSseEvent event =
          sse.newEventBuilder()
              .name("acp-event")
              .id(envelope.eventId())
              .mediaType(jakarta.ws.rs.core.MediaType.APPLICATION_JSON_TYPE)
              .data(String.class, payload)
              .build();
      sink.send(event);
    } catch (JsonProcessingException error) {
      throw new IllegalStateException("Failed to serialize ACP event envelope", error);
    }
  }

  private String normalizedSessionId(String sessionId) {
    if (sessionId == null || sessionId.isBlank()) {
      return "unknown";
    }
    return sessionId.trim();
  }

  private String normalizedType(String eventType) {
    if (eventType == null || eventType.isBlank()) {
      return AcpEventEnvelope.TYPE_STATUS;
    }
    return eventType.trim().toLowerCase();
  }
}
