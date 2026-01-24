package reengineering.ddd.teamai.description;

import reengineering.ddd.teamai.model.DiagramType;

public record BizDiagramDescription(
    String name, String description, String plantumlCode, DiagramType diagramType) {}
