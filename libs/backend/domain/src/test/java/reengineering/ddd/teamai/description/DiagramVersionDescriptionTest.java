package reengineering.ddd.teamai.description;

import static org.junit.jupiter.api.Assertions.assertEquals;

import java.util.List;
import org.junit.jupiter.api.Test;
import reengineering.ddd.archtype.Ref;
import reengineering.ddd.teamai.description.DiagramVersionDescription.DiagramSnapshot;

public class DiagramVersionDescriptionTest {
  @Test
  void should_create_version_description() {
    NodeDescription nodeDescription =
        new NodeDescription(
            "class-node", new Ref<>("entity-1"), null, 100.0, 200.0, 300, 200, null, null);
    EdgeDescription edgeDescription =
        new EdgeDescription(
            new Ref<>("node-1"), new Ref<>("node-2"), null, null, "ASSOCIATION", "hasMany", null);
    DiagramSnapshot snapshot =
        new DiagramSnapshot(
            List.of(new DiagramSnapshot.SnapshotNode("node-1", nodeDescription)),
            List.of(new DiagramSnapshot.SnapshotEdge("edge-1", edgeDescription)),
            Viewport.defaultViewport());

    DiagramVersionDescription description = new DiagramVersionDescription("v1.0", snapshot);

    assertEquals("v1.0", description.name());
    assertEquals(snapshot, description.snapshot());
  }
}
