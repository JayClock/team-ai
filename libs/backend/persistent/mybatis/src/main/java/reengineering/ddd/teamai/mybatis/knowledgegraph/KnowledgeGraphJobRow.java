package reengineering.ddd.teamai.mybatis.knowledgegraph;

public class KnowledgeGraphJobRow {
  private long id;
  private int projectId;
  private int diagramId;
  private int attemptCount;

  public long getId() {
    return id;
  }

  public void setId(long id) {
    this.id = id;
  }

  public int getProjectId() {
    return projectId;
  }

  public void setProjectId(int projectId) {
    this.projectId = projectId;
  }

  public int getDiagramId() {
    return diagramId;
  }

  public void setDiagramId(int diagramId) {
    this.diagramId = diagramId;
  }

  public int getAttemptCount() {
    return attemptCount;
  }

  public void setAttemptCount(int attemptCount) {
    this.attemptCount = attemptCount;
  }
}
