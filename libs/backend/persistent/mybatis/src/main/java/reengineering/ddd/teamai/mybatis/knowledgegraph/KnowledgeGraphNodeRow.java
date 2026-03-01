package reengineering.ddd.teamai.mybatis.knowledgegraph;

public class KnowledgeGraphNodeRow {
  private int logicalEntityId;
  private String logicalEntityType;
  private String logicalEntitySubType;
  private String logicalEntityName;
  private String logicalEntityLabel;
  private String logicalEntityDefinition;

  public int getLogicalEntityId() {
    return logicalEntityId;
  }

  public void setLogicalEntityId(int logicalEntityId) {
    this.logicalEntityId = logicalEntityId;
  }

  public String getLogicalEntityType() {
    return logicalEntityType;
  }

  public void setLogicalEntityType(String logicalEntityType) {
    this.logicalEntityType = logicalEntityType;
  }

  public String getLogicalEntitySubType() {
    return logicalEntitySubType;
  }

  public void setLogicalEntitySubType(String logicalEntitySubType) {
    this.logicalEntitySubType = logicalEntitySubType;
  }

  public String getLogicalEntityName() {
    return logicalEntityName;
  }

  public void setLogicalEntityName(String logicalEntityName) {
    this.logicalEntityName = logicalEntityName;
  }

  public String getLogicalEntityLabel() {
    return logicalEntityLabel;
  }

  public void setLogicalEntityLabel(String logicalEntityLabel) {
    this.logicalEntityLabel = logicalEntityLabel;
  }

  public String getLogicalEntityDefinition() {
    return logicalEntityDefinition;
  }

  public void setLogicalEntityDefinition(String logicalEntityDefinition) {
    this.logicalEntityDefinition = logicalEntityDefinition;
  }
}
