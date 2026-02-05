package reengineering.ddd.teamai.description;

import static org.junit.jupiter.api.Assertions.*;

import org.junit.jupiter.api.Test;

public class EdgeStylePropsTest {

  @Test
  void should_create_edge_style_props() {
    EdgeStyleProps props = new EdgeStyleProps("solid", "#000000", "arrow", 2);

    assertEquals("solid", props.lineStyle());
    assertEquals("#000000", props.color());
    assertEquals("arrow", props.arrowType());
    assertEquals(2, props.lineWidth());
  }

  @Test
  void should_support_null_values() {
    EdgeStyleProps props = new EdgeStyleProps(null, null, null, null);

    assertNull(props.lineStyle());
    assertNull(props.color());
    assertNull(props.arrowType());
    assertNull(props.lineWidth());
  }

  @Test
  void should_support_solid_line_style() {
    EdgeStyleProps solid = new EdgeStyleProps("solid", "#000000", "arrow", 2);

    assertEquals("solid", solid.lineStyle());
  }

  @Test
  void should_support_dashed_line_style() {
    EdgeStyleProps dashed = new EdgeStyleProps("dashed", "#666666", "arrow", 1);

    assertEquals("dashed", dashed.lineStyle());
  }

  @Test
  void should_support_dotted_line_style() {
    EdgeStyleProps dotted = new EdgeStyleProps("dotted", "#999999", "arrow", 1);

    assertEquals("dotted", dotted.lineStyle());
  }

  @Test
  void should_support_different_arrow_types() {
    EdgeStyleProps arrow = new EdgeStyleProps("solid", "#000000", "arrow", 2);
    EdgeStyleProps triangle = new EdgeStyleProps("solid", "#000000", "triangle", 1);
    EdgeStyleProps diamond = new EdgeStyleProps("solid", "#000000", "diamond", 1);

    assertEquals("arrow", arrow.arrowType());
    assertEquals("triangle", triangle.arrowType());
    assertEquals("diamond", diamond.arrowType());
  }

  @Test
  void should_support_different_line_widths() {
    EdgeStyleProps thin = new EdgeStyleProps("solid", "#000000", "arrow", 1);
    EdgeStyleProps medium = new EdgeStyleProps("solid", "#000000", "arrow", 2);
    EdgeStyleProps thick = new EdgeStyleProps("solid", "#000000", "arrow", 3);

    assertEquals(1, thin.lineWidth());
    assertEquals(2, medium.lineWidth());
    assertEquals(3, thick.lineWidth());
  }

  @Test
  void should_support_different_colors() {
    EdgeStyleProps black = new EdgeStyleProps("solid", "#000000", "arrow", 1);
    EdgeStyleProps gray = new EdgeStyleProps("solid", "#666666", "arrow", 1);
    EdgeStyleProps red = new EdgeStyleProps("solid", "#ff0000", "arrow", 1);

    assertEquals("#000000", black.color());
    assertEquals("#666666", gray.color());
    assertEquals("#ff0000", red.color());
  }
}
