package reengineering.ddd.teamai.model;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;

import java.util.Iterator;
import java.util.List;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import reactor.core.publisher.Flux;
import reengineering.ddd.archtype.Entity;
import reengineering.ddd.archtype.JsonBlob;
import reengineering.ddd.archtype.Many;
import reengineering.ddd.archtype.Ref;
import reengineering.ddd.teamai.description.DiagramDescription;
import reengineering.ddd.teamai.description.DiagramVersionDescription;
import reengineering.ddd.teamai.description.DiagramVersionDescription.DiagramSnapshot;
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
  @Mock private Diagram.Versions versions;
  @Mock private Diagram.DomainArchitect architect;

  @BeforeEach
  public void setUp() {
    viewport = new Viewport(100, 50, 1.5);
    description = new DiagramDescription("下单流程上下文图", DiagramType.CLASS, viewport);
    diagram = new Diagram("diagram-1", description, nodes, edges, versions);
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
  public void should_return_default_diagram_status() {
    assertEquals(DiagramStatus.DRAFT, diagram.getDescription().status());
  }

  @Test
  public void should_support_published_diagram_status() {
    Diagram publishedDiagram =
        new Diagram(
            "published-1",
            new DiagramDescription("发布图", DiagramType.CLASS, viewport, DiagramStatus.PUBLISHED),
            nodes,
            edges,
            versions);

    assertEquals(DiagramStatus.PUBLISHED, publishedDiagram.getDescription().status());
    assertEquals("published", publishedDiagram.getDescription().status().getValue());
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
        new Diagram("diagram-2", descriptionWithDefaultViewport, nodes, edges, versions);

    Viewport defaultViewport = diagramWithDefaultViewport.getDescription().viewport();
    assertEquals(0, defaultViewport.x());
    assertEquals(0, defaultViewport.y());
    assertEquals(1, defaultViewport.zoom());
  }

  @Test
  public void should_support_all_diagram_types() {
    Diagram flowchartDiagram =
        new Diagram(
            "flow-1",
            new DiagramDescription("流程图", DiagramType.FLOWCHART, viewport),
            nodes,
            edges,
            versions);
    assertEquals(DiagramType.FLOWCHART, flowchartDiagram.getDescription().type());

    Diagram sequenceDiagram =
        new Diagram(
            "seq-1",
            new DiagramDescription("时序图", DiagramType.SEQUENCE, viewport),
            nodes,
            edges,
            versions);
    assertEquals(DiagramType.SEQUENCE, sequenceDiagram.getDescription().type());

    Diagram classDiagram =
        new Diagram(
            "class-1",
            new DiagramDescription("类图", DiagramType.CLASS, viewport),
            nodes,
            edges,
            versions);
    assertEquals(DiagramType.CLASS, classDiagram.getDescription().type());

    Diagram componentDiagram =
        new Diagram(
            "comp-1",
            new DiagramDescription("组件图", DiagramType.COMPONENT, viewport),
            nodes,
            edges,
            versions);
    assertEquals(DiagramType.COMPONENT, componentDiagram.getDescription().type());

    Diagram stateDiagram =
        new Diagram(
            "state-1",
            new DiagramDescription("状态图", DiagramType.STATE, viewport),
            nodes,
            edges,
            versions);
    assertEquals(DiagramType.STATE, stateDiagram.getDescription().type());

    Diagram activityDiagram =
        new Diagram(
            "act-1",
            new DiagramDescription("活动图", DiagramType.ACTIVITY, viewport),
            nodes,
            edges,
            versions);
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
              (JsonBlob) null);
      DiagramEdge expectedEdge = mock(DiagramEdge.class);

      when(edges.add(edgeDesc)).thenReturn(expectedEdge);

      DiagramEdge resultEdge = diagram.addEdge(edgeDesc);

      assertSame(expectedEdge, resultEdge);
      verify(edges).add(edgeDesc);
    }
  }

  @Nested
  class VersionsAssociation {
    @Test
    void should_return_versions_association() {
      assertSame(versions, diagram.versions());
    }

    @Test
    void should_create_version_from_current_nodes_edges_and_viewport() {
      NodeDescription nodeDescription =
          new NodeDescription(
              "class-node", new Ref<>("entity-1"), null, 120.0, 240.0, 300, 180, null, null);
      DiagramNode node = new DiagramNode("node-1", nodeDescription, () -> null);

      EdgeDescription edgeDescription =
          new EdgeDescription(
              new Ref<>("node-1"),
              new Ref<>("node-2"),
              "right",
              "left",
              "ASSOCIATION",
              "contains",
              (JsonBlob) null);
      DiagramEdge edge = new DiagramEdge("edge-1", edgeDescription);

      when(nodes.findAll()).thenReturn(manyOf(List.of(node)));
      when(edges.findAll()).thenReturn(manyOf(List.of(edge)));
      when(versions.findAll())
          .thenReturn(
              manyOf(
                  List.of(
                      new DiagramVersion(
                          "version-1",
                          new DiagramVersionDescription(
                              "v1",
                              new DiagramSnapshot(
                                  List.of(), List.of(), Viewport.defaultViewport()))))));

      DiagramVersion expectedVersion = mock(DiagramVersion.class);
      when(versions.add(any())).thenReturn(expectedVersion);

      DiagramVersion result = diagram.createVersion();

      assertSame(expectedVersion, result);

      ArgumentCaptor<DiagramVersionDescription> captor =
          ArgumentCaptor.forClass(DiagramVersionDescription.class);
      verify(versions).add(captor.capture());
      DiagramVersionDescription versionDescription = captor.getValue();

      assertEquals("v2", versionDescription.name());
      assertEquals(viewport, versionDescription.snapshot().viewport());
      assertEquals(1, versionDescription.snapshot().nodes().size());
      assertEquals("node-1", versionDescription.snapshot().nodes().get(0).id());
      assertEquals(nodeDescription, versionDescription.snapshot().nodes().get(0).description());
      assertEquals(1, versionDescription.snapshot().edges().size());
      assertEquals("edge-1", versionDescription.snapshot().edges().get(0).id());
      assertEquals(edgeDescription, versionDescription.snapshot().edges().get(0).description());
    }
  }

  @Nested
  class ProposeModel {
    @Test
    void should_delegate_to_domain_architect() {
      String requirement = "As a domain architect, I want a draft model proposal";
      Flux<String> expected = Flux.just("{\"nodes\":[],\"edges\":[]}");

      when(architect.proposeModel(requirement)).thenReturn(expected);

      Flux<String> actual = diagram.proposeModel(requirement, architect);

      assertSame(expected, actual);
      verify(architect).proposeModel(requirement);
      verifyNoMoreInteractions(architect);
    }
  }

  @Nested
  class BatchAdd {
    @Test
    void should_delegate_add_nodes_to_nodes_add_all() {
      NodeDescription nodeDesc =
          new NodeDescription(
              "class-node", new Ref<>("entity-1"), null, 100.0, 200.0, 300, 200, null, null);
      DiagramNode createdNode = mock(DiagramNode.class);

      when(nodes.addAll(List.of(nodeDesc))).thenReturn(List.of(createdNode));

      List<DiagramNode> result = diagram.addNodes(List.of(nodeDesc));

      assertEquals(1, result.size());
      assertSame(createdNode, result.get(0));
      verify(nodes).addAll(List.of(nodeDesc));
    }

    @Test
    void should_delegate_add_edges_to_edges_add_all() {
      EdgeDescription edgeDesc =
          new EdgeDescription(
              new Ref<>("node-1"),
              new Ref<>("node-2"),
              "right",
              "left",
              "ASSOCIATION",
              "hasMany",
              (JsonBlob) null);
      DiagramEdge createdEdge = mock(DiagramEdge.class);

      when(edges.addAll(List.of(edgeDesc))).thenReturn(List.of(createdEdge));

      List<DiagramEdge> result = diagram.addEdges(List.of(edgeDesc));

      assertEquals(1, result.size());
      assertSame(createdEdge, result.get(0));
      verify(edges).addAll(List.of(edgeDesc));
    }

    @Test
    void should_return_empty_when_add_nodes_with_empty_input() {
      assertTrue(diagram.addNodes(List.of()).isEmpty());
      assertTrue(diagram.addNodes(null).isEmpty());
      verify(nodes, never()).addAll(any());
    }

    @Test
    void should_return_empty_when_add_edges_with_empty_input() {
      assertTrue(diagram.addEdges(List.of()).isEmpty());
      assertTrue(diagram.addEdges(null).isEmpty());
      verify(edges, never()).addAll(any());
    }
  }

  private static <E extends Entity<?, ?>> Many<E> manyOf(List<E> entities) {
    List<E> items = List.copyOf(entities);
    return new Many<>() {
      @Override
      public int size() {
        return items.size();
      }

      @Override
      public Many<E> subCollection(int from, int to) {
        return manyOf(items.subList(from, to));
      }

      @Override
      public Iterator<E> iterator() {
        return items.iterator();
      }
    };
  }
}
