package reengineering.ddd.teamai.description;

public record McpServerDescription(
    String name, Transport transport, String target, boolean enabled) {
  public McpServerDescription(String name, Transport transport, String target, Boolean enabled) {
    this(name, transport, target, enabled != null && enabled);
  }

  public enum Transport {
    STDIO,
    HTTP,
    SSE
  }
}
