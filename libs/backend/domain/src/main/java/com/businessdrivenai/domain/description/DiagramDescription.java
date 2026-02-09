package com.businessdrivenai.domain.description;

import com.businessdrivenai.domain.model.DiagramType;

public record DiagramDescription(String title, DiagramType type, Viewport viewport) {}
