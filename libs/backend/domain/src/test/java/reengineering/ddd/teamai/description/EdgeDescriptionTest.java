package reengineering.ddd.teamai.description;

import static org.junit.jupiter.api.Assertions.*;

import org.junit.jupiter.api.Test;
import reengineering.ddd.archtype.JsonBlob;
import reengineering.ddd.archtype.Ref;

public class EdgeDescriptionTest {

  @Test
  void should_create_edge_description() {
    JsonBlob styleProps = edgeStyleProps("solid", "#000000", "arrow", 2);
    EdgeDescription description =
        new EdgeDescription(
            new Ref<>("node-1"),
            new Ref<>("node-2"),
            "source-handle-1",
            "target-handle-1",
            "ASSOCIATION",
            "hasMany",
            styleProps,
            false);

    assertEquals("node-1", description.sourceNode().id());
    assertEquals("node-2", description.targetNode().id());
    assertEquals("source-handle-1", description.sourceHandle());
    assertEquals("target-handle-1", description.targetHandle());
    assertEquals("ASSOCIATION", description.relationType());
    assertEquals("hasMany", description.label());
    assertEquals(styleProps, description.styleProps());
    assertFalse(description.hidden());
  }

  @Test
  void should_support_null_handles() {
    JsonBlob styleProps = edgeStyleProps("solid", "#000000", "arrow", 1);
    EdgeDescription description =
        new EdgeDescription(
            new Ref<>("node-1"),
            new Ref<>("node-2"),
            null,
            null,
            "ASSOCIATION",
            null,
            styleProps,
            false);

    assertNull(description.sourceHandle());
    assertNull(description.targetHandle());
    assertNull(description.label());
  }

  @Test
  void should_support_null_label() {
    JsonBlob styleProps = edgeStyleProps("solid", "#000000", "arrow", 1);
    EdgeDescription description =
        new EdgeDescription(
            new Ref<>("node-1"),
            new Ref<>("node-2"),
            "right",
            "left",
            "INHERITANCE",
            null,
            styleProps,
            false);

    assertNull(description.label());
  }

  @Test
  void should_support_null_style_props() {
    EdgeDescription description =
        new EdgeDescription(
            new Ref<>("node-1"),
            new Ref<>("node-2"),
            "right",
            "left",
            "ASSOCIATION",
            "1..*",
            (JsonBlob) null,
            false);

    assertNull(description.styleProps());
  }

  @Test
  void should_support_different_relation_types() {
    JsonBlob styleProps = edgeStyleProps("solid", "#000000", "arrow", 1);

    EdgeDescription association =
        new EdgeDescription(
            new Ref<>("node-1"),
            new Ref<>("node-2"),
            null,
            null,
            "ASSOCIATION",
            "1..*",
            styleProps,
            false);
    EdgeDescription inheritance =
        new EdgeDescription(
            new Ref<>("node-1"),
            new Ref<>("node-2"),
            null,
            null,
            "INHERITANCE",
            null,
            styleProps,
            false);
    EdgeDescription aggregation =
        new EdgeDescription(
            new Ref<>("node-1"),
            new Ref<>("node-2"),
            null,
            null,
            "AGGREGATION",
            "contains",
            styleProps,
            false);
    EdgeDescription flow =
        new EdgeDescription(
            new Ref<>("node-1"),
            new Ref<>("node-2"),
            "right",
            "left",
            "FLOW",
            "triggers",
            styleProps,
            false);
    EdgeDescription dependency =
        new EdgeDescription(
            new Ref<>("node-1"),
            new Ref<>("node-2"),
            null,
            null,
            "DEPENDENCY",
            "depends on",
            styleProps,
            false);

    assertEquals("ASSOCIATION", association.relationType());
    assertEquals("INHERITANCE", inheritance.relationType());
    assertEquals("AGGREGATION", aggregation.relationType());
    assertEquals("FLOW", flow.relationType());
    assertEquals("DEPENDENCY", dependency.relationType());
  }

  @Test
  void should_support_different_labels() {
    JsonBlob styleProps = edgeStyleProps("solid", "#000000", "arrow", 1);

    EdgeDescription oneToMany =
        new EdgeDescription(
            new Ref<>("node-1"),
            new Ref<>("node-2"),
            null,
            null,
            "ASSOCIATION",
            "1..*",
            styleProps,
            false);
    EdgeDescription hasMany =
        new EdgeDescription(
            new Ref<>("node-1"),
            new Ref<>("node-2"),
            null,
            null,
            "ASSOCIATION",
            "hasMany",
            styleProps,
            false);
    EdgeDescription triggers =
        new EdgeDescription(
            new Ref<>("node-1"),
            new Ref<>("node-2"),
            "right",
            "left",
            "FLOW",
            "triggers",
            styleProps,
            false);

    assertEquals("1..*", oneToMany.label());
    assertEquals("hasMany", hasMany.label());
    assertEquals("triggers", triggers.label());
  }

  @Test
  void should_support_edge_with_all_properties() {
    JsonBlob styleProps = edgeStyleProps("dashed", "#666666", "arrow", 2);
    EdgeDescription description =
        new EdgeDescription(
            new Ref<>("node-1"),
            new Ref<>("node-2"),
            "right",
            "left",
            "DEPENDENCY",
            "depends on",
            styleProps,
            false);

    assertEquals("node-1", description.sourceNode().id());
    assertEquals("node-2", description.targetNode().id());
    assertEquals("right", description.sourceHandle());
    assertEquals("left", description.targetHandle());
    assertEquals("DEPENDENCY", description.relationType());
    assertEquals("depends on", description.label());
    assertTrue(description.styleProps().json().contains("\"lineStyle\":\"dashed\""));
    assertTrue(description.styleProps().json().contains("\"lineWidth\":2"));
  }

  @Test
  void should_support_hidden_flag() {
    EdgeDescription description =
        new EdgeDescription(
            new Ref<>("node-1"), new Ref<>("node-2"), null, null, "FLOW", null, null, true);

    assertTrue(description.hidden());
  }

  private JsonBlob edgeStyleProps(
      String lineStyle, String color, String arrowType, Integer lineWidth) {
    return new JsonBlob(
        "{\"lineStyle\":\""
            + lineStyle
            + "\",\"color\":\""
            + color
            + "\",\"arrowType\":\""
            + arrowType
            + "\",\"lineWidth\":"
            + lineWidth
            + "}");
  }
}
