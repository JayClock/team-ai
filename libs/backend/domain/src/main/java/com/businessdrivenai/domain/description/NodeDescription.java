package com.businessdrivenai.domain.description;

import com.businessdrivenai.archtype.JsonBlob;
import com.businessdrivenai.archtype.Ref;

public record NodeDescription(
    String type,
    Ref<String> logicalEntity,
    Ref<String> parent,
    double positionX,
    double positionY,
    Integer width,
    Integer height,
    JsonBlob styleConfig,
    JsonBlob localData) {}
