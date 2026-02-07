package reengineering.ddd.teamai.description;

import reengineering.ddd.archtype.Ref;

public record EdgeDescription(
    Ref<String> diagram,
    Ref<String> sourceNode,
    Ref<String> targetNode,
    String sourceHandle,
    String targetHandle,
    EdgeRelationType relationType,
    String label,
    EdgeStyleProps styleProps) {}
