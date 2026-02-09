package com.businessdrivenai.domain.description;

public record Viewport(double x, double y, double zoom) {
  public static Viewport defaultViewport() {
    return new Viewport(0, 0, 1);
  }
}
