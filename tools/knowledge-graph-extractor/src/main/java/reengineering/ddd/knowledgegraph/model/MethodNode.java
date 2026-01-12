package reengineering.ddd.knowledgegraph.model;

public class MethodNode extends Node {
  public MethodNode(String className, String methodName, String signature, String visibility) {
    super("METHOD:" + className + "." + methodName);
    setProperty("className", className);
    setProperty("name", methodName);
    setProperty("signature", signature);
    setProperty("visibility", visibility);
  }

  @Override
  public String getType() {
    return "Method";
  }
}
