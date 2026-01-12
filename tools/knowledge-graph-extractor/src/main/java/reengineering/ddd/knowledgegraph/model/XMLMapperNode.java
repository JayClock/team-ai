package reengineering.ddd.knowledgegraph.model;

public class XMLMapperNode extends Node {
  public XMLMapperNode(String namespace, String filepath) {
    super("XML:" + namespace);
    setProperty("namespace", namespace);
    setProperty("filepath", filepath);
  }

  @Override
  public String getType() {
    return "XMLMapper";
  }
}
