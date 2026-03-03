package reengineering.ddd.teamai.mybatis.mappers;

import java.time.Instant;

public class ProjectAcpSessionEventRow {
  private int sessionId;
  private String eventId;
  private String eventType;
  private Instant emittedAt;
  private String dataJson;
  private String errorJson;

  public int getSessionId() {
    return sessionId;
  }

  public void setSessionId(int sessionId) {
    this.sessionId = sessionId;
  }

  public String getEventId() {
    return eventId;
  }

  public void setEventId(String eventId) {
    this.eventId = eventId;
  }

  public String getEventType() {
    return eventType;
  }

  public void setEventType(String eventType) {
    this.eventType = eventType;
  }

  public Instant getEmittedAt() {
    return emittedAt;
  }

  public void setEmittedAt(Instant emittedAt) {
    this.emittedAt = emittedAt;
  }

  public String getDataJson() {
    return dataJson;
  }

  public void setDataJson(String dataJson) {
    this.dataJson = dataJson;
  }

  public String getErrorJson() {
    return errorJson;
  }

  public void setErrorJson(String errorJson) {
    this.errorJson = errorJson;
  }
}
