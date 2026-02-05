package reengineering.ddd.teamai.model;

import static org.junit.jupiter.api.Assertions.*;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;
import reengineering.ddd.archtype.Ref;
import reengineering.ddd.teamai.description.EdgeDescription;
import reengineering.ddd.teamai.description.EdgeStyleProps;

public class DiagramEdgeTest {
  private DiagramEdge edge;
  private EdgeDescription description;

  @BeforeEach
  public void setUp() {
    description =
        new EdgeDescription(
            new Ref<>("diagram-1"),
            new Ref<>("node-1"),
            new Ref<>("node-2"),
            "source-handle-1",
            "target-handle-1",
            "ASSOCIATION",
            "hasMany",
            new EdgeStyleProps("solid", "#000000", "arrow", 2));
    edge = new DiagramEdge("edge-1", "diagram-1", description);
  }

  @Nested
  class Identity {
    @Test
    void should_return_identity() {
      assertEquals("edge-1", edge.getIdentity());
    }
  }

  @Nested
  class Description {
    @Test
    void should_return_description() {
      assertEquals(description, edge.getDescription());
    }

    @Test
    void should_return_diagram_ref() {
      assertEquals("diagram-1", edge.getDescription().diagram().id());
    }

    @Test
    void should_return_source_node_id() {
      assertEquals("node-1", edge.getDescription().sourceNode().id());
    }

    @Test
    void should_return_target_node_id() {
      assertEquals("node-2", edge.getDescription().targetNode().id());
    }

    @Test
    void should_return_source_handle() {
      assertEquals("source-handle-1", edge.getDescription().sourceHandle());
    }

    @Test
    void should_return_target_handle() {
      assertEquals("target-handle-1", edge.getDescription().targetHandle());
    }

    @Test
    void should_return_relation_type() {
      assertEquals("ASSOCIATION", edge.getDescription().relationType());
    }

    @Test
    void should_return_label() {
      assertEquals("hasMany", edge.getDescription().label());
    }

    @Test
    void should_return_style_props() {
      EdgeStyleProps styleProps = edge.getDescription().styleProps();
      assertNotNull(styleProps);
      assertEquals("solid", styleProps.lineStyle());
      assertEquals("#000000", styleProps.color());
      assertEquals("arrow", styleProps.arrowType());
      assertEquals(2, styleProps.lineWidth());
    }
  }

  @Nested
  class DiagramId {
    @Test
    void should_return_diagram_id() {
      assertEquals("diagram-1", edge.getDiagramId());
    }
  }

  @Nested
  class DifferentRelationTypes {
    @Test
    void should_support_association_relation() {
      EdgeDescription associationDesc =
          new EdgeDescription(
              new Ref<>("diagram-1"),
              new Ref<>("node-1"),
              new Ref<>("node-2"),
              null,
              null,
              "ASSOCIATION",
              "1..*",
              new EdgeStyleProps("solid", "#000000", "arrow", 1));

      DiagramEdge associationEdge = new DiagramEdge("edge-1", "diagram-1", associationDesc);
      assertEquals("ASSOCIATION", associationEdge.getDescription().relationType());
      assertEquals("1..*", associationEdge.getDescription().label());
    }

    @Test
    void should_support_inheritance_relation() {
      EdgeDescription inheritanceDesc =
          new EdgeDescription(
              new Ref<>("diagram-1"),
              new Ref<>("node-1"),
              new Ref<>("node-2"),
              null,
              null,
              "INHERITANCE",
              null,
              new EdgeStyleProps("solid", "#000000", "triangle", 1));

      DiagramEdge inheritanceEdge = new DiagramEdge("edge-2", "diagram-1", inheritanceDesc);
      assertEquals("INHERITANCE", inheritanceEdge.getDescription().relationType());
      assertNull(inheritanceEdge.getDescription().label());
    }

    @Test
    void should_support_aggregation_relation() {
      EdgeDescription aggregationDesc =
          new EdgeDescription(
              new Ref<>("diagram-1"),
              new Ref<>("node-1"),
              new Ref<>("node-2"),
              null,
              null,
              "AGGREGATION",
              "contains",
              new EdgeStyleProps("solid", "#000000", "diamond", 1));

      DiagramEdge aggregationEdge = new DiagramEdge("edge-3", "diagram-1", aggregationDesc);
      assertEquals("AGGREGATION", aggregationEdge.getDescription().relationType());
      assertEquals("contains", aggregationEdge.getDescription().label());
    }

    @Test
    void should_support_flow_relation() {
      EdgeDescription flowDesc =
          new EdgeDescription(
              new Ref<>("diagram-1"),
              new Ref<>("node-1"),
              new Ref<>("node-2"),
              "right",
              "left",
              "FLOW",
              "triggers",
              new EdgeStyleProps("solid", "#666666", "arrow", 2));

      DiagramEdge flowEdge = new DiagramEdge("edge-4", "diagram-1", flowDesc);
      assertEquals("FLOW", flowEdge.getDescription().relationType());
      assertEquals("triggers", flowEdge.getDescription().label());
    }

    @Test
    void should_support_dependency_relation() {
      EdgeDescription dependencyDesc =
          new EdgeDescription(
              new Ref<>("diagram-1"),
              new Ref<>("node-1"),
              new Ref<>("node-2"),
              null,
              null,
              "DEPENDENCY",
              "depends on",
              new EdgeStyleProps("dashed", "#666666", "arrow", 1));

      DiagramEdge dependencyEdge = new DiagramEdge("edge-5", "diagram-1", dependencyDesc);
      assertEquals("DEPENDENCY", dependencyEdge.getDescription().relationType());
      assertEquals("depends on", dependencyEdge.getDescription().label());
    }
  }

  @Nested
  class EdgeStyles {
    @Test
    void should_support_solid_line_style() {
      EdgeStyleProps solidStyle = new EdgeStyleProps("solid", "#000000", "arrow", 2);
      assertEquals("solid", solidStyle.lineStyle());
    }

    @Test
    void should_support_dashed_line_style() {
      EdgeStyleProps dashedStyle = new EdgeStyleProps("dashed", "#666666", "arrow", 1);
      assertEquals("dashed", dashedStyle.lineStyle());
    }

    @Test
    void should_support_dotted_line_style() {
      EdgeStyleProps dottedStyle = new EdgeStyleProps("dotted", "#999999", "arrow", 1);
      assertEquals("dotted", dottedStyle.lineStyle());
    }

    @Test
    void should_support_different_arrow_types() {
      EdgeStyleProps arrowStyle = new EdgeStyleProps("solid", "#000000", "arrow", 2);
      EdgeStyleProps triangleStyle = new EdgeStyleProps("solid", "#000000", "triangle", 1);
      EdgeStyleProps diamondStyle = new EdgeStyleProps("solid", "#000000", "diamond", 1);

      assertEquals("arrow", arrowStyle.arrowType());
      assertEquals("triangle", triangleStyle.arrowType());
      assertEquals("diamond", diamondStyle.arrowType());
    }

    @Test
    void should_support_different_line_widths() {
      EdgeStyleProps thinStyle = new EdgeStyleProps("solid", "#000000", "arrow", 1);
      EdgeStyleProps thickStyle = new EdgeStyleProps("solid", "#000000", "arrow", 3);

      assertEquals(1, thinStyle.lineWidth());
      assertEquals(3, thickStyle.lineWidth());
    }
  }

  @Nested
  class Handles {
    @Test
    void should_support_handles() {
      EdgeDescription edgeWithHandles =
          new EdgeDescription(
              new Ref<>("diagram-1"),
              new Ref<>("node-1"),
              new Ref<>("node-2"),
              "right",
              "left",
              "ASSOCIATION",
              null,
              new EdgeStyleProps("solid", "#000000", "arrow", 1));

      DiagramEdge edge = new DiagramEdge("edge-1", "diagram-1", edgeWithHandles);
      assertEquals("right", edge.getDescription().sourceHandle());
      assertEquals("left", edge.getDescription().targetHandle());
    }

    @Test
    void should_support_null_handles() {
      EdgeDescription edgeWithoutHandles =
          new EdgeDescription(
              new Ref<>("diagram-1"),
              new Ref<>("node-1"),
              new Ref<>("node-2"),
              null,
              null,
              "ASSOCIATION",
              null,
              new EdgeStyleProps("solid", "#000000", "arrow", 1));

      DiagramEdge edge = new DiagramEdge("edge-2", "diagram-1", edgeWithoutHandles);
      assertNull(edge.getDescription().sourceHandle());
      assertNull(edge.getDescription().targetHandle());
    }
  }
}
