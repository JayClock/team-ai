package reengineering.ddd.knowledgegraph;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import reengineering.ddd.knowledgegraph.extractor.KnowledgeGraphExtractor;
import reengineering.ddd.knowledgegraph.neo4j.Neo4jGraphStore;

public class KnowledgeGraphApplication {
  private static final Logger logger = LoggerFactory.getLogger(KnowledgeGraphApplication.class);

  public static void main(String[] args) {
    String userDir = System.getProperty("user.dir");
    String projectPath =
        System.getProperty(
            "project.path",
            userDir.contains("/tools/knowledge-graph-extractor")
                ? userDir.replace("/tools/knowledge-graph-extractor", "")
                : userDir);
    String neo4jUri = System.getProperty("neo4j.uri", "bolt://localhost:7687");
    String neo4jUser = System.getProperty("neo4j.user", "neo4j");
    String neo4jPassword = System.getProperty("neo4j.password", "password");
    boolean clearDatabase = Boolean.getBoolean("neo4j.clear");

    logger.info("Starting knowledge graph extraction...");
    logger.info("Project path: {}", projectPath);
    logger.info("Neo4j URI: {}", neo4jUri);
    logger.info("User dir: {}", userDir);

    try {
      KnowledgeGraphExtractor extractor = new KnowledgeGraphExtractor();
      extractor.extract(projectPath);
      extractor.printSummary();

      if (clearDatabase) {
        logger.info("Clearing Neo4j database...");
        try (Neo4jGraphStore store = new Neo4jGraphStore(neo4jUri, neo4jUser, neo4jPassword)) {
          store.clearDatabase();
        }
      }

      logger.info("Storing graph in Neo4j...");
      try (Neo4jGraphStore store = new Neo4jGraphStore(neo4jUri, neo4jUser, neo4jPassword)) {
        store.storeGraph(extractor.getGraph());
      }

      logger.info("Knowledge graph extraction completed successfully!");

    } catch (Exception e) {
      logger.error("Failed to extract knowledge graph", e);
      System.exit(1);
    }
  }
}
