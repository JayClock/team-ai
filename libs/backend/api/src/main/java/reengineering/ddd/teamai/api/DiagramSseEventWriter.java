package reengineering.ddd.teamai.api;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import jakarta.ws.rs.sse.OutboundSseEvent;
import jakarta.ws.rs.sse.Sse;
import jakarta.ws.rs.sse.SseEventSink;
import org.springframework.stereotype.Component;

@Component
public class DiagramSseEventWriter {
  private final ObjectMapper objectMapper;

  public DiagramSseEventWriter(ObjectMapper objectMapper) {
    this.objectMapper = objectMapper;
  }

  void sendEvent(SseEventSink sseEventSink, Sse sse, String eventName, String data) {
    String payload = data == null ? "" : data;
    OutboundSseEvent.Builder builder = sse.newEventBuilder();
    if (eventName != null && !eventName.isBlank()) {
      builder.name(eventName);
    }
    OutboundSseEvent event = builder.data(String.class, payload).build();
    sseEventSink.send(event);
  }

  void sendStructuredChunk(
      SseEventSink sseEventSink, Sse sse, String kind, String format, String chunk) {
    StructuredChunkPayload payload = new StructuredChunkPayload(kind, format, chunk);
    try {
      sendEvent(sseEventSink, sse, "structured", objectMapper.writeValueAsString(payload));
    } catch (JsonProcessingException error) {
      sendEvent(sseEventSink, sse, "error", "结构化事件序列化失败");
    }
  }

  boolean isValidJson(String payload) {
    if (payload == null || payload.isBlank()) {
      return false;
    }
    return tryParseJson(payload) != null;
  }

  private JsonNode tryParseJson(String content) {
    try {
      return objectMapper.readTree(content);
    } catch (JsonProcessingException ignored) {
      return null;
    }
  }

  private record StructuredChunkPayload(String kind, String format, String chunk) {}
}
