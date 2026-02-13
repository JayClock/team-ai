package reengineering.ddd.teamai.model;

import static org.junit.jupiter.api.Assertions.*;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;
import reengineering.ddd.archtype.JsonBlob;
import reengineering.ddd.archtype.Ref;
import reengineering.ddd.teamai.description.EdgeDescription;

public class DiagramEdgeTest {
  private DiagramEdge edge;
  private EdgeDescription description;

  @BeforeEach
  public void setUp() {
    description =
        new EdgeDescription(
            new Ref<>("node-1"),
            new Ref<>("node-2"),
            "source-handle-1",
            "target-handle-1",
            "ASSOCIATION",
            "hasMany",
            edgeStyleProps("solid", "#000000", "arrow", 2));
    edge = new DiagramEdge("edge-1", description);
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
      assertNotNull(edge.getDescription().sourceNode());
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
      JsonBlob styleProps = edge.getDescription().styleProps();
      assertNotNull(styleProps);
      assertTrue(styleProps.json().contains("\"lineStyle\":\"solid\""));
      assertTrue(styleProps.json().contains("\"color\":\"#000000\""));
      assertTrue(styleProps.json().contains("\"arrowType\":\"arrow\""));
      assertTrue(styleProps.json().contains("\"lineWidth\":2"));
    }
  }

  @Nested
  class DifferentRelationTypes {
    @Test
    void should_support_association_relation() {
      EdgeDescription associationDesc =
          new EdgeDescription(
              new Ref<>("node-1"),
              new Ref<>("node-2"),
              null,
              null,
              "ASSOCIATION",
              "1..*",
              edgeStyleProps("solid", "#000000", "arrow", 1));

      DiagramEdge associationEdge = new DiagramEdge("edge-1", associationDesc);
      assertEquals("ASSOCIATION", associationEdge.getDescription().relationType());
      assertEquals("1..*", associationEdge.getDescription().label());
    }

    @Test
    void should_support_inheritance_relation() {
      EdgeDescription inheritanceDesc =
          new EdgeDescription(
              new Ref<>("node-1"),
              new Ref<>("node-2"),
              null,
              null,
              "INHERITANCE",
              null,
              edgeStyleProps("solid", "#000000", "triangle", 1));

      DiagramEdge inheritanceEdge = new DiagramEdge("edge-2", inheritanceDesc);
      assertEquals("INHERITANCE", inheritanceEdge.getDescription().relationType());
      assertNull(inheritanceEdge.getDescription().label());
    }

    @Test
    void should_support_aggregation_relation() {
      EdgeDescription aggregationDesc =
          new EdgeDescription(
              new Ref<>("node-1"),
              new Ref<>("node-2"),
              null,
              null,
              "AGGREGATION",
              "contains",
              edgeStyleProps("solid", "#000000", "diamond", 1));

      DiagramEdge aggregationEdge = new DiagramEdge("edge-3", aggregationDesc);
      assertEquals("AGGREGATION", aggregationEdge.getDescription().relationType());
      assertEquals("contains", aggregationEdge.getDescription().label());
    }

    @Test
    void should_support_flow_relation() {
      EdgeDescription flowDesc =
          new EdgeDescription(
              new Ref<>("node-1"),
              new Ref<>("node-2"),
              "right",
              "left",
              "FLOW",
              "triggers",
              edgeStyleProps("solid", "#666666", "arrow", 2));

      DiagramEdge flowEdge = new DiagramEdge("edge-4", flowDesc);
      assertEquals("FLOW", flowEdge.getDescription().relationType());
      assertEquals("triggers", flowEdge.getDescription().label());
    }

    @Test
    void should_support_dependency_relation() {
      EdgeDescription dependencyDesc =
          new EdgeDescription(
              new Ref<>("node-1"),
              new Ref<>("node-2"),
              null,
              null,
              "DEPENDENCY",
              "depends on",
              edgeStyleProps("dashed", "#666666", "arrow", 1));

      DiagramEdge dependencyEdge = new DiagramEdge("edge-5", dependencyDesc);
      assertEquals("DEPENDENCY", dependencyEdge.getDescription().relationType());
      assertEquals("depends on", dependencyEdge.getDescription().label());
    }
  }

  @Nested
  class EdgeStyles {
    @Test
    void should_support_solid_line_style() {
      JsonBlob solidStyle = edgeStyleProps("solid", "#000000", "arrow", 2);
      assertTrue(solidStyle.json().contains("\"lineStyle\":\"solid\""));
    }

    @Test
    void should_support_dashed_line_style() {
      JsonBlob dashedStyle = edgeStyleProps("dashed", "#666666", "arrow", 1);
      assertTrue(dashedStyle.json().contains("\"lineStyle\":\"dashed\""));
    }

    @Test
    void should_support_dotted_line_style() {
      JsonBlob dottedStyle = edgeStyleProps("dotted", "#999999", "arrow", 1);
      assertTrue(dottedStyle.json().contains("\"lineStyle\":\"dotted\""));
    }

    @Test
    void should_support_different_arrow_types() {
      JsonBlob arrowStyle = edgeStyleProps("solid", "#000000", "arrow", 2);
      JsonBlob triangleStyle = edgeStyleProps("solid", "#000000", "triangle", 1);
      JsonBlob diamondStyle = edgeStyleProps("solid", "#000000", "diamond", 1);

      assertTrue(arrowStyle.json().contains("\"arrowType\":\"arrow\""));
      assertTrue(triangleStyle.json().contains("\"arrowType\":\"triangle\""));
      assertTrue(diamondStyle.json().contains("\"arrowType\":\"diamond\""));
    }

    @Test
    void should_support_different_line_widths() {
      JsonBlob thinStyle = edgeStyleProps("solid", "#000000", "arrow", 1);
      JsonBlob thickStyle = edgeStyleProps("solid", "#000000", "arrow", 3);

      assertTrue(thinStyle.json().contains("\"lineWidth\":1"));
      assertTrue(thickStyle.json().contains("\"lineWidth\":3"));
    }
  }

  @Nested
  class Handles {
    @Test
    void should_support_handles() {
      EdgeDescription edgeWithHandles =
          new EdgeDescription(
              new Ref<>("node-1"),
              new Ref<>("node-2"),
              "right",
              "left",
              "ASSOCIATION",
              null,
              edgeStyleProps("solid", "#000000", "arrow", 1));

      DiagramEdge edge = new DiagramEdge("edge-1", edgeWithHandles);
      assertEquals("right", edge.getDescription().sourceHandle());
      assertEquals("left", edge.getDescription().targetHandle());
    }

    @Test
    void should_support_null_handles() {
      EdgeDescription edgeWithoutHandles =
          new EdgeDescription(
              new Ref<>("node-1"),
              new Ref<>("node-2"),
              null,
              null,
              "ASSOCIATION",
              null,
              edgeStyleProps("solid", "#000000", "arrow", 1));

      DiagramEdge edge = new DiagramEdge("edge-2", edgeWithoutHandles);
      assertNull(edge.getDescription().sourceHandle());
      assertNull(edge.getDescription().targetHandle());
    }
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
