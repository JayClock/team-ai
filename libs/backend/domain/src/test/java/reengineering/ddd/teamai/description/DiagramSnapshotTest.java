package reengineering.ddd.teamai.description;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertSame;
import static org.mockito.Mockito.any;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import java.util.Iterator;
import java.util.List;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import reengineering.ddd.archtype.Entity;
import reengineering.ddd.archtype.Many;
import reengineering.ddd.archtype.Ref;
import reengineering.ddd.teamai.model.Diagram;
import reengineering.ddd.teamai.model.DiagramEdge;
import reengineering.ddd.teamai.model.DiagramNode;
import reengineering.ddd.teamai.model.DiagramType;
import reengineering.ddd.teamai.model.DiagramVersion;

@ExtendWith(MockitoExtension.class)
public class DiagramSnapshotTest {
  @Mock private Diagram.Nodes nodes;
  @Mock private Diagram.Edges edges;
  @Mock private Diagram.Versions versions;

  @Test
  void should_build_snapshot_via_diagram_create_version() {
    Viewport viewport = new Viewport(10.0, 20.0, 1.2);
    Diagram diagram =
        new Diagram(
            "diagram-1",
            new DiagramDescription("订单图", DiagramType.CLASS, viewport),
            nodes,
            edges,
            versions);

    NodeDescription nodeDescription =
        new NodeDescription(
            "class-node", new Ref<>("entity-1"), null, 100.0, 200.0, 300, 200, null, null);
    DiagramNode node = new DiagramNode("node-1", nodeDescription, () -> null);

    EdgeDescription edgeDescription =
        new EdgeDescription(
            new Ref<>("node-1"), new Ref<>("node-2"), null, null, "ASSOCIATION", "hasMany", null);
    DiagramEdge edge = new DiagramEdge("edge-1", edgeDescription);

    when(nodes.findAll()).thenReturn(manyOf(List.of(node)));
    when(edges.findAll()).thenReturn(manyOf(List.of(edge)));
    when(versions.findAll()).thenReturn(manyOf(List.of()));

    DiagramVersion expectedVersion = new DiagramVersion("version-1", null);
    when(versions.add(any())).thenReturn(expectedVersion);

    DiagramVersion version = diagram.createVersion();

    assertSame(expectedVersion, version);

    ArgumentCaptor<DiagramVersionDescription> captor =
        ArgumentCaptor.forClass(DiagramVersionDescription.class);
    verify(versions).add(captor.capture());
    DiagramVersionDescription description = captor.getValue();

    assertEquals("v1", description.name());
    assertEquals(viewport, description.snapshot().viewport());
    assertEquals(1, description.snapshot().nodes().size());
    assertEquals("node-1", description.snapshot().nodes().get(0).id());
    assertEquals(nodeDescription, description.snapshot().nodes().get(0).description());
    assertEquals(1, description.snapshot().edges().size());
    assertEquals("edge-1", description.snapshot().edges().get(0).id());
    assertEquals(edgeDescription, description.snapshot().edges().get(0).description());
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
