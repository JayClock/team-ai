package reengineering.ddd.knowledgegraph;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import reengineering.ddd.knowledgegraph.analysis.CLI;
import reengineering.ddd.knowledgegraph.analysis.LocalQueryAnalyzer;
import reengineering.ddd.knowledgegraph.exporter.LocalGraphExporter;
import reengineering.ddd.knowledgegraph.extractor.KnowledgeGraphExtractor;

public class LocalGraphApplication {
  private static final Logger logger = LoggerFactory.getLogger(LocalGraphApplication.class);

  public static void main(String[] args) {
    String userDir = System.getProperty("user.dir");
    String projectPath =
        System.getProperty(
            "project.path",
            userDir.contains("/tools/knowledge-graph-extractor")
                ? userDir.replace("/tools/knowledge-graph-extractor", "")
                : userDir);
    String outputDir = System.getProperty("output.dir", userDir + "/knowledge-graph");
    String queryType = System.getProperty("query", null);
    String nodeId = System.getProperty("node", null);
    boolean interactive = Boolean.getBoolean("interactive");

    logger.info("Starting local knowledge graph extraction...");
    logger.info("Project path: {}", projectPath);
    logger.info("Output directory: {}", outputDir);
    logger.info("Interactive mode: {}", interactive);

    try {
      KnowledgeGraphExtractor extractor = new KnowledgeGraphExtractor();
      extractor.extract(projectPath);
      extractor.printSummary();

      LocalGraphExporter exporter = new LocalGraphExporter(extractor.getGraph(), outputDir);
      exporter.exportAll();

      LocalQueryAnalyzer analyzer = new LocalQueryAnalyzer(extractor.getGraph());

      if (queryType != null) {
        logger.info("Running query: {}", queryType);
        runQuery(analyzer, queryType, nodeId);
      }

      if (interactive) {
        CLI cli = new CLI(extractor.getGraph());
        cli.exportQueryResults(outputDir + "/queries");
        cli.runInteractive();
      }

      logger.info("\n=== Local Knowledge Graph Extraction Completed Successfully ===");
      logger.info("Output directory: {}", outputDir);
      logger.info("\nNext steps:");
      logger.info("1. Open {} in IntelliJ IDEA", outputDir + "/architecture.md");
      logger.info("2. Install Mermaid plugin in IntelliJ IDEA (if not installed)");
      logger.info("3. Click the 'Preview' button in the Markdown editor");
      logger.info("4. Click nodes to navigate to source files");

    } catch (Exception e) {
      logger.error("Failed to extract knowledge graph", e);
      System.exit(1);
    }
  }

  private static void runQuery(LocalQueryAnalyzer analyzer, String queryType, String nodeId) {
    switch (queryType.toLowerCase()) {
      case "api-to-domain":
        analyzer.findApiToDomainFlow().print();
        break;
      case "smart-domain":
        analyzer.findSmartDomainAssociations().print();
        break;
      case "violations":
        analyzer.findArchitectureViolations().print();
        break;
      case "impact":
        if (nodeId == null) {
          System.err.println("Error: Please specify node ID with -Dnode=<nodeId>");
        } else {
          analyzer.analyzeImpact(nodeId).print();
        }
        break;
      case "unused":
        analyzer.findUnusedEntities().print();
        break;
      default:
        System.err.println("Unknown query type: " + queryType);
        System.err.println(
            "Available queries: api-to-domain, smart-domain, violations, impact, unused");
    }
  }
}
