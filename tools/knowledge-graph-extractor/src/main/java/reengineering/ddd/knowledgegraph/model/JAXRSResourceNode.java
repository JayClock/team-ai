package reengineering.ddd.knowledgegraph.model;

public class JAXRSResourceNode extends Node {
  public JAXRSResourceNode(String className, String path, Layer layer) {
    super("JAXRS:" + className);
    setProperty("name", className);
    setProperty("path", path);
    setProperty("layer", layer.name());
  }

  @Override
  public String getType() {
    return "JAXRSResource";
  }
}
