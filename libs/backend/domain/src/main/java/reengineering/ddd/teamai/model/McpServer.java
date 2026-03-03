package reengineering.ddd.teamai.model;

import reengineering.ddd.archtype.Entity;
import reengineering.ddd.teamai.description.McpServerDescription;

public class McpServer implements Entity<String, McpServerDescription> {
  private String identity;
  private McpServerDescription description;

  public McpServer(String identity, McpServerDescription description) {
    this.identity = identity;
    this.description = description;
  }

  public McpServer() {}

  @Override
  public String getIdentity() {
    return identity;
  }

  @Override
  public McpServerDescription getDescription() {
    return description;
  }
}
