package reengineering.ddd.knowledgegraph.model;

public class DomainInterfaceNode extends Node {
  public DomainInterfaceNode(String interfaceName, String type) {
    super("INTERFACE:" + interfaceName);
    setProperty("name", interfaceName);
    setProperty("type", type);
  }

  @Override
  public String getType() {
    return "DomainInterface";
  }
}
