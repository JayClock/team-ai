package reengineering.ddd.teamai.description;

import static org.junit.jupiter.api.Assertions.*;

import org.junit.jupiter.api.Test;
import reengineering.ddd.archtype.Ref;

public class EdgeDescriptionTest {

  @Test
  void should_create_edge_description() {
    EdgeStyleProps styleProps = new EdgeStyleProps("solid", "#000000", "arrow", 2);
    EdgeDescription description =
        new EdgeDescription(
            new Ref<>("node-1"),
            new Ref<>("node-2"),
            "source-handle-1",
            "target-handle-1",
            EdgeRelationType.ASSOCIATION,
            "hasMany",
            styleProps);

    assertEquals("node-1", description.sourceNode().id());
    assertEquals("node-2", description.targetNode().id());
    assertEquals("source-handle-1", description.sourceHandle());
    assertEquals("target-handle-1", description.targetHandle());
    assertEquals(EdgeRelationType.ASSOCIATION, description.relationType());
    assertEquals("hasMany", description.label());
    assertEquals(styleProps, description.styleProps());
  }

  @Test
  void should_support_null_handles() {
    EdgeStyleProps styleProps = new EdgeStyleProps("solid", "#000000", "arrow", 1);
    EdgeDescription description =
        new EdgeDescription(
            new Ref<>("node-1"),
            new Ref<>("node-2"),
            null,
            null,
            EdgeRelationType.ASSOCIATION,
            null,
            styleProps);

    assertNull(description.sourceHandle());
    assertNull(description.targetHandle());
    assertNull(description.label());
  }

  @Test
  void should_support_null_label() {
    EdgeStyleProps styleProps = new EdgeStyleProps("solid", "#000000", "arrow", 1);
    EdgeDescription description =
        new EdgeDescription(
            new Ref<>("node-1"),
            new Ref<>("node-2"),
            "right",
            "left",
            EdgeRelationType.INHERITANCE,
            null,
            styleProps);

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
            EdgeRelationType.ASSOCIATION,
            "1..*",
            null);

    assertNull(description.styleProps());
  }

  @Test
  void should_support_different_relation_types() {
    EdgeStyleProps styleProps = new EdgeStyleProps("solid", "#000000", "arrow", 1);

    EdgeDescription association =
        new EdgeDescription(
            new Ref<>("node-1"),
            new Ref<>("node-2"),
            null,
            null,
            EdgeRelationType.ASSOCIATION,
            "1..*",
            styleProps);
    EdgeDescription inheritance =
        new EdgeDescription(
            new Ref<>("node-1"),
            new Ref<>("node-2"),
            null,
            null,
            EdgeRelationType.INHERITANCE,
            null,
            styleProps);
    EdgeDescription aggregation =
        new EdgeDescription(
            new Ref<>("node-1"),
            new Ref<>("node-2"),
            null,
            null,
            EdgeRelationType.AGGREGATION,
            "contains",
            styleProps);
    EdgeDescription flow =
        new EdgeDescription(
            new Ref<>("node-1"),
            new Ref<>("node-2"),
            "right",
            "left",
            EdgeRelationType.FLOW,
            "triggers",
            styleProps);
    EdgeDescription dependency =
        new EdgeDescription(
            new Ref<>("node-1"),
            new Ref<>("node-2"),
            null,
            null,
            EdgeRelationType.DEPENDENCY,
            "depends on",
            styleProps);

    assertEquals(EdgeRelationType.ASSOCIATION, association.relationType());
    assertEquals(EdgeRelationType.INHERITANCE, inheritance.relationType());
    assertEquals(EdgeRelationType.AGGREGATION, aggregation.relationType());
    assertEquals(EdgeRelationType.FLOW, flow.relationType());
    assertEquals(EdgeRelationType.DEPENDENCY, dependency.relationType());
  }

  @Test
  void should_support_different_labels() {
    EdgeStyleProps styleProps = new EdgeStyleProps("solid", "#000000", "arrow", 1);

    EdgeDescription oneToMany =
        new EdgeDescription(
            new Ref<>("node-1"),
            new Ref<>("node-2"),
            null,
            null,
            EdgeRelationType.ASSOCIATION,
            "1..*",
            styleProps);
    EdgeDescription hasMany =
        new EdgeDescription(
            new Ref<>("node-1"),
            new Ref<>("node-2"),
            null,
            null,
            EdgeRelationType.ASSOCIATION,
            "hasMany",
            styleProps);
    EdgeDescription triggers =
        new EdgeDescription(
            new Ref<>("node-1"),
            new Ref<>("node-2"),
            "right",
            "left",
            EdgeRelationType.FLOW,
            "triggers",
            styleProps);

    assertEquals("1..*", oneToMany.label());
    assertEquals("hasMany", hasMany.label());
    assertEquals("triggers", triggers.label());
  }

  @Test
  void should_support_edge_with_all_properties() {
    EdgeStyleProps styleProps = new EdgeStyleProps("dashed", "#666666", "arrow", 2);
    EdgeDescription description =
        new EdgeDescription(
            new Ref<>("node-1"),
            new Ref<>("node-2"),
            "right",
            "left",
            EdgeRelationType.DEPENDENCY,
            "depends on",
            styleProps);

    assertEquals("node-1", description.sourceNode().id());
    assertEquals("node-2", description.targetNode().id());
    assertEquals("right", description.sourceHandle());
    assertEquals("left", description.targetHandle());
    assertEquals(EdgeRelationType.DEPENDENCY, description.relationType());
    assertEquals("depends on", description.label());
    assertEquals("dashed", description.styleProps().lineStyle());
    assertEquals(2, description.styleProps().lineWidth());
  }
}
