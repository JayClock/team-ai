package reengineering.ddd.knowledgegraph;

import static org.junit.jupiter.api.Assertions.*;

import java.io.File;
import java.nio.file.Path;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import reengineering.ddd.knowledgegraph.extractor.KnowledgeGraphExtractor;
import reengineering.ddd.knowledgegraph.model.Graph;
import reengineering.ddd.knowledgegraph.model.Relationship;

class KnowledgeGraphExtractorTest {

  @Test
  void testExtraction(@TempDir Path tempDir) {
    KnowledgeGraphExtractor extractor = new KnowledgeGraphExtractor();
    String projectRoot = findProjectRoot();

    assertDoesNotThrow(() -> extractor.extract(projectRoot));

    Graph graph = extractor.getGraph();

    assertTrue(graph.getNodes().size() > 0, "Graph should have nodes");
    assertTrue(graph.getRelationships().size() > 0, "Graph should have relationships");

    assertTrue(
        graph.getNodes().stream().anyMatch(n -> n.getType().equals("JAXRSResource")),
        "Graph should have JAXRS resources");

    assertTrue(
        graph.getNodes().stream().anyMatch(n -> n.getType().equals("Entity")),
        "Graph should have entities");

    assertTrue(
        graph.getNodes().stream().anyMatch(n -> n.getType().equals("MyBatisMapper")),
        "Graph should have MyBatis mappers");

    assertTrue(
        graph.getRelationships().stream()
            .anyMatch(r -> r.getType() == Relationship.Type.BELONGS_TO),
        "Graph should have BELONGS_TO relationships");

    assertTrue(
        graph.getRelationships().stream()
            .anyMatch(r -> r.getType() == Relationship.Type.IMPLEMENTS),
        "Graph should have IMPLEMENTS relationships");

    extractor.printSummary();
  }

  private String findProjectRoot() {
    String userDir = System.getProperty("user.dir");
    File current = new File(userDir);

    while (current != null) {
      File nxJson = new File(current, "nx.json");
      File settingsGradle = new File(current, "settings.gradle");

      if (nxJson.exists() || settingsGradle.exists()) {
        return current.getAbsolutePath();
      }

      current = current.getParentFile();
    }

    throw new RuntimeException("Could not find project root. Started from: " + userDir);
  }
}
