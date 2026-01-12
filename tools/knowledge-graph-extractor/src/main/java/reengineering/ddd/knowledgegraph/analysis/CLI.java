package reengineering.ddd.knowledgegraph.analysis;

import java.io.FileWriter;
import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Paths;
import java.util.Scanner;
import reengineering.ddd.knowledgegraph.model.Graph;

public class CLI {
  private final Graph graph;
  private final LocalQueryAnalyzer analyzer;
  private final Scanner scanner;

  public CLI(Graph graph) {
    this.graph = graph;
    this.analyzer = new LocalQueryAnalyzer(graph);
    this.scanner = new Scanner(System.in);
  }

  public void runInteractive() {
    System.out.println("=== Knowledge Graph Query Analyzer (Interactive Mode) ===\n");
    System.out.println("Available commands:");
    System.out.println("  1. api-to-domain      - Find API to Domain flow");
    System.out.println("  2. smart-domain       - Find Smart Domain associations");
    System.out.println("  3. violations         - Find architecture violations");
    System.out.println("  4. impact <nodeId>    - Analyze impact of a node");
    System.out.println("  5. unused            - Find unused entities");
    System.out.println("  6. node <nodeId>      - Find node by ID");
    System.out.println("  7. incoming <nodeId>  - Find incoming relationships");
    System.out.println("  8. outgoing <nodeId>  - Find outgoing relationships");
    System.out.println("  9. stats              - Show graph statistics");
    System.out.println("  0. exit              - Exit\n");

    while (true) {
      System.out.print("\n> ");
      String input = scanner.nextLine().trim();

      if (input.isEmpty() || input.equals("exit") || input.equals("0")) {
        System.out.println("Goodbye!");
        break;
      }

      handleCommand(input);
    }
  }

  public void runCommand(String command) {
    handleCommand(command);
  }

  private void handleCommand(String input) {
    String[] parts = input.split("\\s+");
    String cmd = parts[0].toLowerCase();
    String arg = parts.length > 1 ? parts[1] : null;

    switch (cmd) {
      case "api-to-domain":
      case "1":
        analyzer.findApiToDomainFlow().print();
        break;
      case "smart-domain":
      case "2":
        analyzer.findSmartDomainAssociations().print();
        break;
      case "violations":
      case "3":
        analyzer.findArchitectureViolations().print();
        break;
      case "impact":
      case "4":
        if (arg == null) {
          System.out.println("Error: Please provide a node ID");
          System.out.println("Usage: impact <nodeId>");
        } else {
          analyzer.analyzeImpact(arg).print();
        }
        break;
      case "unused":
      case "5":
        analyzer.findUnusedEntities().print();
        break;
      case "node":
      case "6":
        if (arg == null) {
          System.out.println("Error: Please provide a node ID");
          System.out.println("Usage: node <nodeId>");
        } else {
          analyzer.findNodeById(arg).print();
        }
        break;
      case "incoming":
      case "7":
        if (arg == null) {
          System.out.println("Error: Please provide a node ID");
          System.out.println("Usage: incoming <nodeId>");
        } else {
          analyzer.findIncomingRelationships(arg).print();
        }
        break;
      case "outgoing":
      case "8":
        if (arg == null) {
          System.out.println("Error: Please provide a node ID");
          System.out.println("Usage: outgoing <nodeId>");
        } else {
          analyzer.findOutgoingRelationships(arg).print();
        }
        break;
      case "stats":
      case "9":
        printStatistics();
        break;
      case "help":
      case "?":
        printHelp();
        break;
      default:
        System.out.println("Unknown command: " + cmd);
        System.out.println("Type 'help' for available commands");
    }
  }

  private void printStatistics() {
    System.out.println("\n=== Graph Statistics ===");
    System.out.println("Total Nodes: " + graph.getNodes().size());
    System.out.println("Total Relationships: " + graph.getRelationships().size());

    System.out.println("\nNodes by Type:");
    graph.getNodes().stream()
        .collect(
            java.util.stream.Collectors.groupingBy(
                n -> n.getType(), java.util.stream.Collectors.counting()))
        .forEach((type, count) -> System.out.println("  " + type + ": " + count));

    System.out.println("\nRelationships by Type:");
    graph.getRelationships().stream()
        .collect(
            java.util.stream.Collectors.groupingBy(
                r -> r.getType().toString(), java.util.stream.Collectors.counting()))
        .forEach((type, count) -> System.out.println("  " + type + ": " + count));
  }

  private void printHelp() {
    System.out.println("\n=== Available Commands ===");
    System.out.println("  1. api-to-domain      - Find API to Domain flow");
    System.out.println("  2. smart-domain       - Find Smart Domain associations");
    System.out.println("  3. violations         - Find architecture violations");
    System.out.println("  4. impact <nodeId>    - Analyze impact of a node");
    System.out.println("  5. unused            - Find unused entities");
    System.out.println("  6. node <nodeId>      - Find node by ID");
    System.out.println("  7. incoming <nodeId>  - Find incoming relationships");
    System.out.println("  8. outgoing <nodeId>  - Find outgoing relationships");
    System.out.println("  9. stats              - Show graph statistics");
    System.out.println("  0. exit              - Exit");
  }

  public void exportQueryResults(String outputDir) throws IOException {
    Files.createDirectories(Paths.get(outputDir));

    exportQueryResult(analyzer.findApiToDomainFlow(), outputDir + "/api-to-domain.md");
    exportQueryResult(analyzer.findSmartDomainAssociations(), outputDir + "/smart-domain.md");
    exportQueryResult(
        analyzer.findArchitectureViolations(), outputDir + "/architecture-violations.md");
    exportQueryResult(analyzer.findUnusedEntities(), outputDir + "/unused-entities.md");

    System.out.println("\n=== Query Results Exported ===");
    System.out.println("All files saved to: " + outputDir);
  }

  private void exportQueryResult(LocalQueryAnalyzer.QueryResult result, String filePath)
      throws IOException {
    try (FileWriter writer = new FileWriter(filePath)) {
      writer.write(result.toMarkdown());
    }
    System.out.println("✓ Exported: " + filePath);
  }
}
