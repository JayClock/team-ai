package reengineering.ddd.teamai.model;

import java.util.List;

public interface AcpSessionEventStore {
  void append(String projectId, AcpSessionEvent event);

  List<AcpSessionEvent> findBySession(
      String projectId, String sessionId, String afterEventId, int limit);
}
