package reengineering.ddd.knowledgegraph.model;

public class DTONode extends Node {
  public DTONode(String className) {
    super("DTO:" + className);
    setProperty("name", className);
  }

  @Override
  public String getType() {
    return "DTO";
  }
}
