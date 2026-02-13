package reengineering.ddd.teamai.description;

import reengineering.ddd.teamai.model.DiagramType;

public record DiagramDescription(String title, DiagramType type, Viewport viewport) {}
