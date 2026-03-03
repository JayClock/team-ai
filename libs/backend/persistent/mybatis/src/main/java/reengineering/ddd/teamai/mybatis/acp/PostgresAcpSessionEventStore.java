package reengineering.ddd.teamai.mybatis.acp;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import jakarta.inject.Inject;
import java.util.List;
import java.util.Map;
import org.springframework.context.annotation.Primary;
import org.springframework.dao.DuplicateKeyException;
import org.springframework.stereotype.Component;
import reengineering.ddd.teamai.model.AcpSessionEvent;
import reengineering.ddd.teamai.model.AcpSessionEventStore;
import reengineering.ddd.teamai.mybatis.mappers.ProjectAcpSessionEventRow;
import reengineering.ddd.teamai.mybatis.mappers.ProjectAcpSessionEventsMapper;

@Component
@Primary
public class PostgresAcpSessionEventStore implements AcpSessionEventStore {
  private final ProjectAcpSessionEventsMapper mapper;
  private final ObjectMapper objectMapper;

  @Inject
  public PostgresAcpSessionEventStore(
      ProjectAcpSessionEventsMapper mapper, ObjectMapper objectMapper) {
    this.mapper = mapper;
    this.objectMapper = objectMapper;
  }

  @Override
  public void append(String projectId, AcpSessionEvent event) {
    ProjectAcpSessionEventRow row = new ProjectAcpSessionEventRow();
    row.setEventId(event.eventId());
    row.setSessionId(parseId(event.sessionId(), "sessionId"));
    row.setEventType(event.type());
    row.setEmittedAt(event.emittedAt());
    row.setDataJson(writeJson(event.data()));
    row.setErrorJson(writeJson(event.error()));

    try {
      mapper.insertEvent(
          parseId(projectId, "projectId"), parseId(event.sessionId(), "sessionId"), row);
    } catch (DuplicateKeyException ignored) {
      // Idempotent event append: ignore duplicate event_id writes.
    }
  }

  @Override
  public List<AcpSessionEvent> findBySession(
      String projectId, String sessionId, String afterEventId, int limit) {
    int normalizedLimit = sanitizeLimit(limit);
    return mapper
        .findEventsBySession(
            parseId(projectId, "projectId"),
            parseId(sessionId, "sessionId"),
            afterEventId,
            normalizedLimit)
        .stream()
        .map(this::toModel)
        .toList();
  }

  private AcpSessionEvent toModel(ProjectAcpSessionEventRow row) {
    return new AcpSessionEvent(
        row.getEventId(),
        String.valueOf(row.getSessionId()),
        row.getEventType(),
        row.getEmittedAt(),
        readData(row.getDataJson()),
        readError(row.getErrorJson()));
  }

  private Map<String, Object> readData(String json) {
    if (json == null || json.isBlank()) {
      return Map.of();
    }
    try {
      return objectMapper.readValue(json, new TypeReference<>() {});
    } catch (JsonProcessingException error) {
      return Map.of();
    }
  }

  private AcpSessionEvent.Error readError(String json) {
    if (json == null || json.isBlank()) {
      return null;
    }
    try {
      Map<String, Object> data = objectMapper.readValue(json, new TypeReference<>() {});
      String code = String.valueOf(data.getOrDefault("code", "UNKNOWN"));
      String message = String.valueOf(data.getOrDefault("message", ""));
      boolean retryable =
          Boolean.parseBoolean(String.valueOf(data.getOrDefault("retryable", false)));
      long retryAfterMs = Long.parseLong(String.valueOf(data.getOrDefault("retryAfterMs", 0)));
      return new AcpSessionEvent.Error(code, message, retryable, retryAfterMs);
    } catch (RuntimeException | JsonProcessingException error) {
      return null;
    }
  }

  private String writeJson(Object value) {
    if (value == null) {
      return null;
    }
    try {
      return objectMapper.writeValueAsString(value);
    } catch (JsonProcessingException error) {
      throw new IllegalStateException("Failed to serialize ACP session event payload", error);
    }
  }

  private int parseId(String rawId, String fieldName) {
    if (rawId == null || rawId.isBlank()) {
      throw new IllegalArgumentException(fieldName + " must not be blank");
    }
    try {
      return Integer.parseInt(rawId.trim());
    } catch (NumberFormatException error) {
      throw new IllegalArgumentException(fieldName + " must be numeric: " + rawId);
    }
  }

  private int sanitizeLimit(int limit) {
    if (limit <= 0) {
      return 200;
    }
    return Math.min(limit, 1000);
  }
}
