package reengineering.ddd.knowledgegraph.model;

public class DatabaseTableNode extends Node {
  public DatabaseTableNode(String tableName) {
    super("TABLE:" + tableName);
    setProperty("name", tableName);
  }

  public DatabaseTableNode(String tableName, String filePath) {
    super("TABLE:" + tableName, filePath);
    setProperty("name", tableName);
  }

  @Override
  public String getType() {
    return "DatabaseTable";
  }
}
