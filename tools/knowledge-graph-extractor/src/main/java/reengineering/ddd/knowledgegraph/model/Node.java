package reengineering.ddd.knowledgegraph.model;

import java.util.HashMap;
import java.util.Map;
import java.util.Objects;

public abstract class Node {
  protected final String id;
  protected final Map<String, Object> properties;
  protected String filePath;

  protected Node(String id) {
    this.id = id;
    this.properties = new HashMap<>();
    this.filePath = null;
  }

  protected Node(String id, String filePath) {
    this.id = id;
    this.properties = new HashMap<>();
    this.filePath = filePath;
  }

  public String getId() {
    return id;
  }

  public Map<String, Object> getProperties() {
    return properties;
  }

  public abstract String getType();

  public void setProperty(String key, Object value) {
    properties.put(key, value);
  }

  public Object getProperty(String key) {
    return properties.get(key);
  }

  public String getFilePath() {
    return filePath;
  }

  public void setFilePath(String filePath) {
    this.filePath = filePath;
  }

  @Override
  public boolean equals(Object o) {
    if (this == o) return true;
    if (o == null || getClass() != o.getClass()) return false;
    Node node = (Node) o;
    return Objects.equals(id, node.id);
  }

  @Override
  public int hashCode() {
    return Objects.hash(id);
  }
}
