package reengineering.ddd.knowledgegraph.model;

public class ExternalServiceNode extends Node {
  public ExternalServiceNode(String serviceName) {
    super("SERVICE:" + serviceName);
    setProperty("name", serviceName);
  }

  public ExternalServiceNode(String serviceName, String filePath) {
    super("SERVICE:" + serviceName, filePath);
    setProperty("name", serviceName);
  }

  @Override
  public String getType() {
    return "ExternalService";
  }
}
