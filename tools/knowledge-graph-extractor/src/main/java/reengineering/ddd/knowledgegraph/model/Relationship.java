package reengineering.ddd.knowledgegraph.model;

import java.util.Objects;

public class Relationship {
  public enum Type {
    BELONGS_TO,
    CONTAINS,
    IMPLEMENTS,
    EXTENDS,
    INJECTS,
    CALLS,
    EXPOSES_AS,
    IMPLEMENTED_BY,
    MAPS_TO,
    BINDS_TO,
    GENERATES_LINK,
    RETURNS_STREAM,
    USES_SSE,
    HAS_PROPERTY,
    TRIGGERED_BY,
    OPERATES_ON,
    READS_FROM,
    WRITES_TO,
    DEFINES_QUERY,
    USES,
    HOLDS_REFERENCE_TO
  }

  private final String sourceId;
  private final String targetId;
  private final Type type;
  private final String label;

  public Relationship(String sourceId, String targetId, Type type) {
    this(sourceId, targetId, type, null);
  }

  public Relationship(String sourceId, String targetId, Type type, String label) {
    this.sourceId = sourceId;
    this.targetId = targetId;
    this.type = type;
    this.label = label;
  }

  public String getSourceId() {
    return sourceId;
  }

  public String getTargetId() {
    return targetId;
  }

  public Type getType() {
    return type;
  }

  public String getLabel() {
    return label;
  }

  @Override
  public boolean equals(Object o) {
    if (this == o) return true;
    if (o == null || getClass() != o.getClass()) return false;
    Relationship that = (Relationship) o;
    return Objects.equals(sourceId, that.sourceId)
        && Objects.equals(targetId, that.targetId)
        && type == that.type;
  }

  @Override
  public int hashCode() {
    return Objects.hash(sourceId, targetId, type);
  }
}
