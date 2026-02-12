package reengineering.ddd.teamai.model;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;

import java.util.List;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import reengineering.ddd.archtype.Ref;
import reengineering.ddd.teamai.description.DiagramDescription;
import reengineering.ddd.teamai.description.EdgeDescription;
import reengineering.ddd.teamai.description.NodeDescription;
import reengineering.ddd.teamai.description.Viewport;

@ExtendWith(MockitoExtension.class)
public class DiagramTest {
  private Diagram diagram;
  private DiagramDescription description;
  private Viewport viewport;

  @Mock private Diagram.Nodes nodes;
  @Mock private Diagram.Edges edges;
  @Mock private Diagram.DomainArchitect architect;

  @BeforeEach
  public void setUp() {
    viewport = new Viewport(100, 50, 1.5);
    description = new DiagramDescription("下单流程上下文图", DiagramType.CLASS, viewport);
    diagram = new Diagram("diagram-1", description, nodes, edges);
  }

  @Test
  public void should_return_identity() {
    assertEquals("diagram-1", diagram.getIdentity());
  }

  @Test
  public void should_return_description() {
    assertEquals(description, diagram.getDescription());
  }

  @Test
  public void should_return_diagram_title() {
    assertEquals("下单流程上下文图", diagram.getDescription().title());
  }

  @Test
  public void should_return_diagram_type() {
    assertEquals(DiagramType.CLASS, diagram.getDescription().type());
  }

  @Test
  public void should_return_diagram_type_value() {
    assertEquals("class", diagram.getDescription().type().getValue());
  }

  @Test
  public void should_return_viewport() {
    Viewport resultViewport = diagram.getDescription().viewport();
    assertNotNull(resultViewport);
    assertEquals(100, resultViewport.x());
    assertEquals(50, resultViewport.y());
    assertEquals(1.5, resultViewport.zoom());
  }

  @Test
  public void should_create_diagram_with_default_viewport() {
    DiagramDescription descriptionWithDefaultViewport =
        new DiagramDescription("会员体系图", DiagramType.SEQUENCE, Viewport.defaultViewport());
    Diagram diagramWithDefaultViewport =
        new Diagram("diagram-2", descriptionWithDefaultViewport, nodes, edges);

    Viewport defaultViewport = diagramWithDefaultViewport.getDescription().viewport();
    assertEquals(0, defaultViewport.x());
    assertEquals(0, defaultViewport.y());
    assertEquals(1, defaultViewport.zoom());
  }

  @Test
  public void should_support_all_diagram_types() {
    Diagram flowchartDiagram =
        new Diagram(
            "flow-1", new DiagramDescription("流程图", DiagramType.FLOWCHART, viewport), nodes, edges);
    assertEquals(DiagramType.FLOWCHART, flowchartDiagram.getDescription().type());

    Diagram sequenceDiagram =
        new Diagram(
            "seq-1", new DiagramDescription("时序图", DiagramType.SEQUENCE, viewport), nodes, edges);
    assertEquals(DiagramType.SEQUENCE, sequenceDiagram.getDescription().type());

    Diagram classDiagram =
        new Diagram(
            "class-1", new DiagramDescription("类图", DiagramType.CLASS, viewport), nodes, edges);
    assertEquals(DiagramType.CLASS, classDiagram.getDescription().type());

    Diagram componentDiagram =
        new Diagram(
            "comp-1", new DiagramDescription("组件图", DiagramType.COMPONENT, viewport), nodes, edges);
    assertEquals(DiagramType.COMPONENT, componentDiagram.getDescription().type());

    Diagram stateDiagram =
        new Diagram(
            "state-1", new DiagramDescription("状态图", DiagramType.STATE, viewport), nodes, edges);
    assertEquals(DiagramType.STATE, stateDiagram.getDescription().type());

    Diagram activityDiagram =
        new Diagram(
            "act-1", new DiagramDescription("活动图", DiagramType.ACTIVITY, viewport), nodes, edges);
    assertEquals(DiagramType.ACTIVITY, activityDiagram.getDescription().type());
  }

  @Nested
  class NodesAssociation {
    @Test
    void should_return_nodes_association() {
      assertNotNull(diagram.nodes());
    }

    @Test
    void should_delegate_to_nodes_association() {
      NodeDescription nodeDesc =
          new NodeDescription(
              "class-node", new Ref<>("entity-1"), null, 100.0, 200.0, 300, 200, null, null);
      DiagramNode expectedNode = mock(DiagramNode.class);

      when(nodes.add(nodeDesc)).thenReturn(expectedNode);

      DiagramNode resultNode = diagram.addNode(nodeDesc);

      assertSame(expectedNode, resultNode);
      verify(nodes).add(nodeDesc);
    }
  }

  @Nested
  class EdgesAssociation {
    @Test
    void should_return_edges_association() {
      assertNotNull(diagram.edges());
    }

    @Test
    void should_delegate_to_edges_association() {
      EdgeDescription edgeDesc =
          new EdgeDescription(
              new Ref<>("node-1"),
              new Ref<>("node-2"),
              "right",
              "left",
              "ASSOCIATION",
              "hasMany",
              null);
      DiagramEdge expectedEdge = mock(DiagramEdge.class);

      when(edges.add(edgeDesc)).thenReturn(expectedEdge);

      DiagramEdge resultEdge = diagram.addEdge(edgeDesc);

      assertSame(expectedEdge, resultEdge);
      verify(edges).add(edgeDesc);
    }
  }

  @Nested
  class ProposeModel {
    @Test
    void should_delegate_to_domain_architect() {
      String requirement = "As a domain architect, I want a draft model proposal";
      DiagramDescription.DraftDiagram expected =
          new DiagramDescription.DraftDiagram(List.of(), List.of());

      when(architect.proposeModel(requirement)).thenReturn(expected);

      DiagramDescription.DraftDiagram actual = diagram.proposeModel(requirement, architect);

      assertSame(expected, actual);
      verify(architect).proposeModel(requirement);
      verifyNoMoreInteractions(architect);
    }
  }
}
