package reengineering.ddd.knowledgegraph.model;

public class HATEOASModelNode extends Node {
  public HATEOASModelNode(String modelName, String relation) {
    super("HATEOAS:" + modelName);
    setProperty("name", modelName);
    setProperty("relation", relation);
  }

  @Override
  public String getType() {
    return "HATEOASModel";
  }
}
