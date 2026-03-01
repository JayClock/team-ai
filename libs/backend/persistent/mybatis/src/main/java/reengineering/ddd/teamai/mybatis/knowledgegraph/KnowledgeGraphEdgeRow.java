package reengineering.ddd.teamai.mybatis.knowledgegraph;

public class KnowledgeGraphEdgeRow {
  private int diagramId;
  private int sourceLogicalEntityId;
  private int targetLogicalEntityId;
  private String relationType;

  public int getDiagramId() {
    return diagramId;
  }

  public void setDiagramId(int diagramId) {
    this.diagramId = diagramId;
  }

  public int getSourceLogicalEntityId() {
    return sourceLogicalEntityId;
  }

  public void setSourceLogicalEntityId(int sourceLogicalEntityId) {
    this.sourceLogicalEntityId = sourceLogicalEntityId;
  }

  public int getTargetLogicalEntityId() {
    return targetLogicalEntityId;
  }

  public void setTargetLogicalEntityId(int targetLogicalEntityId) {
    this.targetLogicalEntityId = targetLogicalEntityId;
  }

  public String getRelationType() {
    return relationType;
  }

  public void setRelationType(String relationType) {
    this.relationType = relationType;
  }
}
