package reengineering.ddd.teamai.api.application;

import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.CopyOnWriteArrayList;
import org.springframework.stereotype.Component;
import reengineering.ddd.teamai.model.AcpSessionEvent;
import reengineering.ddd.teamai.model.AcpSessionEventStore;

@Component
public class InMemoryAcpSessionEventStore implements AcpSessionEventStore {
  private final Map<String, CopyOnWriteArrayList<AcpSessionEvent>> eventsBySession =
      new ConcurrentHashMap<>();

  @Override
  public void append(String projectId, AcpSessionEvent event) {
    String key = key(projectId, event.sessionId());
    eventsBySession.computeIfAbsent(key, ignored -> new CopyOnWriteArrayList<>()).add(event);
  }

  @Override
  public List<AcpSessionEvent> findBySession(
      String projectId, String sessionId, String afterEventId, int limit) {
    String key = key(projectId, sessionId);
    List<AcpSessionEvent> events = eventsBySession.getOrDefault(key, new CopyOnWriteArrayList<>());
    if (events.isEmpty()) {
      return List.of();
    }

    int start = 0;
    if (afterEventId != null && !afterEventId.isBlank()) {
      for (int i = 0; i < events.size(); i++) {
        if (afterEventId.equals(events.get(i).eventId())) {
          start = i + 1;
          break;
        }
      }
    }

    int max = sanitizeLimit(limit);
    int end = Math.min(events.size(), start + max);
    if (start >= end) {
      return List.of();
    }
    return new ArrayList<>(events.subList(start, end));
  }

  private String key(String projectId, String sessionId) {
    return normalize(projectId) + ":" + normalize(sessionId);
  }

  private String normalize(String value) {
    if (value == null || value.isBlank()) {
      return "unknown";
    }
    return value.trim();
  }

  private int sanitizeLimit(int limit) {
    if (limit <= 0) {
      return 200;
    }
    return Math.min(limit, 1000);
  }
}
