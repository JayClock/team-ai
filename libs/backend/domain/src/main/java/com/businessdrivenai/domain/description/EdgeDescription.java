package com.businessdrivenai.domain.description;

import com.businessdrivenai.archtype.Ref;

public record EdgeDescription(
    Ref<String> sourceNode,
    Ref<String> targetNode,
    String sourceHandle,
    String targetHandle,
    String relationType,
    String label,
    EdgeStyleProps styleProps) {}
