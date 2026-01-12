package reengineering.ddd.knowledgegraph.model;

public class MyBatisMapperNode extends Node {
  public MyBatisMapperNode(String interfaceName, String namespace) {
    super("MAPPER:" + interfaceName);
    setProperty("name", interfaceName);
    setProperty("namespace", namespace);
  }

  public MyBatisMapperNode(String interfaceName, String namespace, String filePath) {
    super("MAPPER:" + interfaceName, filePath);
    setProperty("name", interfaceName);
    setProperty("namespace", namespace);
  }

  @Override
  public String getType() {
    return "MyBatisMapper";
  }
}
