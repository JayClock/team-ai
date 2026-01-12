package reengineering.ddd.knowledgegraph.neo4j;

import static org.junit.jupiter.api.Assertions.*;

import org.junit.jupiter.api.Disabled;
import org.junit.jupiter.api.Test;
import org.testcontainers.containers.Neo4jContainer;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;
import reengineering.ddd.knowledgegraph.extractor.KnowledgeGraphExtractor;
import reengineering.ddd.knowledgegraph.model.Graph;

@Testcontainers
@Disabled("Requires Neo4j Testcontainers with logback-janino configuration")
class Neo4jGraphStoreTest {

  @Container
  private static final Neo4jContainer<?> neo4j =
      new Neo4jContainer<>("neo4j:5.18").withAdminPassword("password");

  @Test
  void testStoreGraph() {
    KnowledgeGraphExtractor extractor = new KnowledgeGraphExtractor();
    String projectRoot =
        System.getProperty("user.dir").replace("/tools/knowledge-graph-extractor", "");
    extractor.extract(projectRoot);

    Graph graph = extractor.getGraph();

    try (Neo4jGraphStore store =
        new Neo4jGraphStore(neo4j.getBoltUrl(), "neo4j", neo4j.getAdminPassword())) {
      assertDoesNotThrow(() -> store.storeGraph(graph));
    }
  }

  @Test
  void testClearDatabase() {
    KnowledgeGraphExtractor extractor = new KnowledgeGraphExtractor();
    String projectRoot =
        System.getProperty("user.dir").replace("/tools/knowledge-graph-extractor", "");
    extractor.extract(projectRoot);

    Graph graph = extractor.getGraph();

    try (Neo4jGraphStore store =
        new Neo4jGraphStore(neo4j.getBoltUrl(), "neo4j", neo4j.getAdminPassword())) {
      store.storeGraph(graph);

      var countBefore =
          store
              .executeQuery("MATCH (n) RETURN count(n) as count", java.util.Map.of())
              .single()
              .get("count")
              .asLong();

      assertTrue(countBefore > 0);

      store.clearDatabase();

      var countAfter =
          store
              .executeQuery("MATCH (n) RETURN count(n) as count", java.util.Map.of())
              .single()
              .get("count")
              .asLong();

      assertEquals(0, countAfter);
    }
  }
}
