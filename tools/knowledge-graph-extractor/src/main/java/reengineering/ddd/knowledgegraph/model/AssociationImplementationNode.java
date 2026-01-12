package reengineering.ddd.knowledgegraph.model;

public class AssociationImplementationNode extends Node {
  public AssociationImplementationNode(String className, String implementsInterface) {
    super("ASSOC:" + className);
    setProperty("name", className);
    setProperty("implements", implementsInterface);
  }

  @Override
  public String getType() {
    return "AssociationImplementation";
  }
}
