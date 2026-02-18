package reengineering.ddd.teamai.description;

import reengineering.ddd.teamai.model.DiagramStatus;
import reengineering.ddd.teamai.model.DiagramType;

public record DiagramDescription(
    String title, DiagramType type, Viewport viewport, DiagramStatus status) {
  public DiagramDescription {
    status = status == null ? DiagramStatus.DRAFT : status;
  }

  public DiagramDescription(String title, DiagramType type, Viewport viewport) {
    this(title, type, viewport, DiagramStatus.DRAFT);
  }
}
