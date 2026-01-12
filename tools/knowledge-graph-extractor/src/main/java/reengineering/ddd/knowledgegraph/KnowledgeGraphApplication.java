package reengineering.ddd.knowledgegraph;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import reengineering.ddd.knowledgegraph.extractor.KnowledgeGraphExtractor;

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

    logger.info("Starting knowledge graph extraction...");
    logger.info("Project path: {}", projectPath);
    logger.info("User dir: {}", userDir);

    try {
      KnowledgeGraphExtractor extractor = new KnowledgeGraphExtractor();
      extractor.extract(projectPath);
      extractor.printSummary();

      logger.info("Knowledge graph extraction completed successfully!");

    } catch (Exception e) {
      logger.error("Failed to extract knowledge graph", e);
      System.exit(1);
    }
  }
}
