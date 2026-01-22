package reengineering.ddd.teamai.model;

import reengineering.ddd.archtype.Entity;
import reengineering.ddd.teamai.description.BizDiagramDescription;

public class BizDiagram implements Entity<String, BizDiagramDescription> {
  private String identity;
  private BizDiagramDescription description;

  public BizDiagram(String identity, BizDiagramDescription description) {
    this.identity = identity;
    this.description = description;
  }

  private BizDiagram() {}

  @Override
  public String getIdentity() {
    return identity;
  }

  @Override
  public BizDiagramDescription getDescription() {
    return description;
  }

  public static class BizDiagramChange {
    private String name;
    private String description;
    private String plantumlCode;
    private String diagramType;

    public String getName() {
      return name;
    }

    public void setName(String name) {
      this.name = name;
    }

    public String getDescription() {
      return description;
    }

    public void setDescription(String description) {
      this.description = description;
    }

    public String getPlantumlCode() {
      return plantumlCode;
    }

    public void setPlantumlCode(String plantumlCode) {
      this.plantumlCode = plantumlCode;
    }

    public String getDiagramType() {
      return diagramType;
    }

    public void setDiagramType(String diagramType) {
      this.diagramType = diagramType;
    }
  }
}
