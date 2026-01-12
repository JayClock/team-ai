package reengineering.ddd.knowledgegraph.model;

public class EntityNode extends Node {
  public EntityNode(String className, Layer layer) {
    super("ENTITY:" + className);
    setProperty("name", className);
    setProperty("layer", layer.name());
  }

  @Override
  public String getType() {
    return "Entity";
  }
}
