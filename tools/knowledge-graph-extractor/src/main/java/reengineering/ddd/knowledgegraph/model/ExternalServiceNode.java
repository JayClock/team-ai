package reengineering.ddd.knowledgegraph.model;

public class ExternalServiceNode extends Node {
  public ExternalServiceNode(String serviceName) {
    super("SERVICE:" + serviceName);
    setProperty("name", serviceName);
  }

  @Override
  public String getType() {
    return "ExternalService";
  }
}
