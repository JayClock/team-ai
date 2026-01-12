package reengineering.ddd.knowledgegraph.model;

public class DomainInterfaceNode extends Node {
  public DomainInterfaceNode(String interfaceName, String type) {
    super("INTERFACE:" + interfaceName);
    setProperty("name", interfaceName);
    setProperty("type", type);
  }

  public DomainInterfaceNode(String interfaceName, String type, String filePath) {
    super("INTERFACE:" + interfaceName, filePath);
    setProperty("name", interfaceName);
    setProperty("type", type);
  }

  @Override
  public String getType() {
    return "DomainInterface";
  }
}
