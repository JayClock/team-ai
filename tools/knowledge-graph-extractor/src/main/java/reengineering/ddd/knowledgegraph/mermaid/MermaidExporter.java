package reengineering.ddd.knowledgegraph.mermaid;

import java.io.FileWriter;
import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Paths;
import reengineering.ddd.knowledgegraph.model.Graph;

public class MermaidExporter {
  private final MermaidViewGenerator viewGenerator;
  private final String outputDir;

  public MermaidExporter(Graph graph, String outputDir) {
    this.viewGenerator = new MermaidViewGenerator(graph);
    this.outputDir = outputDir;
  }

  public void exportAll() throws IOException {
    Files.createDirectories(Paths.get(outputDir));

    exportArchitectureView();
    exportApiToDatabaseView();
    exportSmartDomainView();
    exportFullGraph();

    System.out.println("=== Mermaid Export Completed ===");
    System.out.println("Output directory: " + outputDir);
  }

  public void exportArchitectureView() throws IOException {
    String mermaid = viewGenerator.generateArchitectureView();
    String filePath = outputDir + "/architecture.md";
    writeToFile(filePath, mermaid);
    System.out.println("✓ Exported: architecture.md");
  }

  public void exportApiToDatabaseView() throws IOException {
    String mermaid = viewGenerator.generateApiToDatabaseView();
    String filePath = outputDir + "/api-to-database.md";
    writeToFile(filePath, mermaid);
    System.out.println("✓ Exported: api-to-database.md");
  }

  public void exportSmartDomainView() throws IOException {
    String mermaid = viewGenerator.generateSmartDomainView();
    String filePath = outputDir + "/smart-domain.md";
    writeToFile(filePath, mermaid);
    System.out.println("✓ Exported: smart-domain.md");
  }

  public void exportFullGraph() throws IOException {
    String mermaid = viewGenerator.generateApiToDatabaseView();
    String filePath = outputDir + "/full-graph.md";
    writeToFile(filePath, mermaid);
    System.out.println("✓ Exported: full-graph.md");
  }

  public void exportCallChain(String startNodeId) throws IOException {
    String mermaid = viewGenerator.generateCallChainView(startNodeId);
    String sanitizedNodeId = startNodeId.replace(":", "_").replace(".", "_");
    String filePath = outputDir + "/call-chain-" + sanitizedNodeId + ".md";
    writeToFile(filePath, mermaid);
    System.out.println("✓ Exported: call-chain-" + sanitizedNodeId + ".md");
  }

  private void writeToFile(String filePath, String content) throws IOException {
    try (FileWriter writer = new FileWriter(filePath)) {
      writer.write(content);
    }
  }
}
