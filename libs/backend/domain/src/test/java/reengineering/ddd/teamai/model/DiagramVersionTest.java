package reengineering.ddd.teamai.model;

import static org.junit.jupiter.api.Assertions.assertEquals;

import java.util.List;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import reengineering.ddd.archtype.Ref;
import reengineering.ddd.teamai.description.DiagramVersionDescription;
import reengineering.ddd.teamai.description.DiagramVersionDescription.DiagramSnapshot;
import reengineering.ddd.teamai.description.EdgeDescription;
import reengineering.ddd.teamai.description.NodeDescription;
import reengineering.ddd.teamai.description.Viewport;

public class DiagramVersionTest {
  private DiagramVersion version;
  private DiagramVersionDescription description;

  @BeforeEach
  void setUp() {
    NodeDescription nodeDescription =
        new NodeDescription(
            "class-node", new Ref<>("entity-1"), null, 100.0, 200.0, 300, 200, null, null);
    EdgeDescription edgeDescription =
        new EdgeDescription(
            new Ref<>("node-1"),
            new Ref<>("node-2"),
            null,
            null,
            "ASSOCIATION",
            "hasMany",
            null,
            false);
    DiagramSnapshot snapshot =
        new DiagramSnapshot(
            List.of(new DiagramSnapshot.SnapshotNode("node-1", nodeDescription)),
            List.of(new DiagramSnapshot.SnapshotEdge("edge-1", edgeDescription)),
            new Viewport(10.0, 20.0, 1.2));
    description = new DiagramVersionDescription("v1.0", snapshot);
    version = new DiagramVersion("version-1", description);
  }

  @Test
  void should_return_identity() {
    assertEquals("version-1", version.getIdentity());
  }

  @Test
  void should_return_description() {
    assertEquals(description, version.getDescription());
    assertEquals("v1.0", version.getDescription().name());
    assertEquals(1, version.getDescription().snapshot().nodes().size());
    assertEquals(1, version.getDescription().snapshot().edges().size());
  }
}
