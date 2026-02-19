package reengineering.ddd.teamai.description;

import reengineering.ddd.teamai.model.Diagram.Status;
import reengineering.ddd.teamai.model.Diagram.Type;

public record DiagramDescription(String title, Type type, Viewport viewport, Status status) {
  public DiagramDescription {
    status = status == null ? Status.DRAFT : status;
  }

  public DiagramDescription(String title, Type type, Viewport viewport) {
    this(title, type, viewport, Status.DRAFT);
  }
}
