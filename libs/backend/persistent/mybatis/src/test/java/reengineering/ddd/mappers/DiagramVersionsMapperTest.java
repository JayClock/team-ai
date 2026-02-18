package reengineering.ddd.mappers;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertTrue;

import jakarta.inject.Inject;
import java.util.List;
import java.util.Random;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mybatis.spring.boot.test.autoconfigure.MybatisTest;
import org.springframework.context.annotation.Import;
import reengineering.ddd.TestContainerConfig;
import reengineering.ddd.TestDataMapper;
import reengineering.ddd.mybatis.support.IdHolder;
import reengineering.ddd.teamai.description.DiagramVersionDescription;
import reengineering.ddd.teamai.description.DiagramVersionDescription.DiagramSnapshot;
import reengineering.ddd.teamai.description.EdgeDescription;
import reengineering.ddd.teamai.description.NodeDescription;
import reengineering.ddd.teamai.description.Viewport;
import reengineering.ddd.teamai.model.DiagramVersion;
import reengineering.ddd.teamai.mybatis.mappers.DiagramVersionsMapper;

@MybatisTest
@Import(TestContainerConfig.class)
public class DiagramVersionsMapperTest {
  @Inject private TestDataMapper testData;
  @Inject private DiagramVersionsMapper mapper;

  private final int userId = id();
  private final int projectId = id();
  private final int diagramId = id();
  private final int versionId = id();

  private static int id() {
    return new Random().nextInt(100000);
  }

  @BeforeEach
  void before() {
    testData.insertUser(userId, "John Smith", "john.smith+" + userId + "@email.com");
    testData.insertProject(projectId, userId, "Test Project" + projectId);
    testData.insertDiagram(
        diagramId,
        projectId,
        "Test Diagram" + diagramId,
        "class",
        "{\"x\":100,\"y\":50,\"zoom\":1.5}");
    testData.insertDiagramVersion(
        versionId,
        diagramId,
        "v1",
        "{\"nodes\":[],\"edges\":[],\"viewport\":{\"x\":0,\"y\":0,\"zoom\":1}}");
  }

  @Test
  void should_find_version_by_diagram_and_id() {
    DiagramVersion version = mapper.findVersionByDiagramAndId(diagramId, versionId);

    assertNotNull(version);
    assertEquals(String.valueOf(versionId), version.getIdentity());
    assertEquals("v1", version.getDescription().name());
    assertNotNull(version.getDescription().snapshot());
    assertEquals(0, version.getDescription().snapshot().nodes().size());
    assertEquals(0, version.getDescription().snapshot().edges().size());
    assertEquals(0, version.getDescription().snapshot().viewport().x());
    assertEquals(0, version.getDescription().snapshot().viewport().y());
    assertEquals(1, version.getDescription().snapshot().viewport().zoom());
  }

  @Test
  void should_find_versions_by_diagram_id_with_pagination() {
    testData.insertDiagramVersion(
        id(),
        diagramId,
        "v2",
        "{\"nodes\":[],\"edges\":[],\"viewport\":{\"x\":1,\"y\":2,\"zoom\":1.2}}");

    List<DiagramVersion> firstPage = mapper.findVersionsByDiagramId(diagramId, 0, 1);
    assertEquals(1, firstPage.size());

    List<DiagramVersion> all = mapper.findVersionsByDiagramId(diagramId, 0, 10);
    assertEquals(2, all.size());
  }

  @Test
  void should_insert_version_and_get_generated_id() {
    IdHolder holder = new IdHolder();
    DiagramVersionDescription description =
        new DiagramVersionDescription(
            "v2",
            new DiagramSnapshot(
                List.of(
                    new DiagramSnapshot.SnapshotNode(
                        "node-1",
                        new NodeDescription(
                            "class-node", null, null, 100.0, 200.0, 300, 200, null, null))),
                List.of(
                    new DiagramSnapshot.SnapshotEdge(
                        "edge-1",
                        new EdgeDescription(null, null, null, null, "ASSOCIATION", "has", null))),
                new Viewport(10.0, 20.0, 1.2)));

    int result = mapper.insertVersion(holder, diagramId, description);

    assertEquals(1, result);
    assertTrue(holder.id() > 0);

    DiagramVersion inserted = mapper.findVersionByDiagramAndId(diagramId, holder.id());
    assertNotNull(inserted);
    assertEquals("v2", inserted.getDescription().name());
    assertEquals(1, inserted.getDescription().snapshot().nodes().size());
    assertEquals(1, inserted.getDescription().snapshot().edges().size());
    assertEquals(10.0, inserted.getDescription().snapshot().viewport().x());
    assertEquals(20.0, inserted.getDescription().snapshot().viewport().y());
    assertEquals(1.2, inserted.getDescription().snapshot().viewport().zoom());
  }

  @Test
  void should_count_versions_by_diagram() {
    int count = mapper.countVersionsByDiagram(diagramId);
    assertEquals(1, count);

    testData.insertDiagramVersion(
        id(),
        diagramId,
        "v2",
        "{\"nodes\":[],\"edges\":[],\"viewport\":{\"x\":0,\"y\":0,\"zoom\":1}}");
    count = mapper.countVersionsByDiagram(diagramId);
    assertEquals(2, count);
  }
}
