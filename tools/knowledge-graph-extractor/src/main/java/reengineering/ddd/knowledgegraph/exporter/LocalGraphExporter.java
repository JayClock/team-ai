package reengineering.ddd.knowledgegraph.exporter;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.SerializationFeature;
import java.io.FileWriter;
import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Paths;
import java.util.*;
import java.util.stream.Collectors;
import reengineering.ddd.knowledgegraph.mermaid.MermaidExporter;
import reengineering.ddd.knowledgegraph.mermaid.MermaidViewGenerator;
import reengineering.ddd.knowledgegraph.model.*;

public class LocalGraphExporter {
  private final Graph graph;
  private final String outputDir;
  private final ObjectMapper objectMapper;
  private final MermaidViewGenerator viewGenerator;

  public LocalGraphExporter(Graph graph, String outputDir) {
    this.graph = graph;
    this.outputDir = outputDir;
    this.objectMapper = new ObjectMapper().enable(SerializationFeature.INDENT_OUTPUT);
    this.viewGenerator = new MermaidViewGenerator(graph);
  }

  public void exportAll() throws IOException {
    Files.createDirectories(Paths.get(outputDir));

    exportMermaid();
    exportJson();
    exportHtml();
    exportStatistics();

    System.out.println("\n=== Local Graph Export Completed ===");
    System.out.println("All files saved to: " + outputDir);
  }

  public void exportMermaid() throws IOException {
    System.out.println("\n=== Exporting Mermaid Files ===");
    MermaidExporter mermaidExporter = new MermaidExporter(graph, outputDir);
    mermaidExporter.exportAll();
  }

  public void exportJson() throws IOException {
    System.out.println("\n=== Exporting JSON Files ===");

    String graphJson = objectMapper.writeValueAsString(new GraphSerializable(graph));
    String graphFilePath = outputDir + "/graph.json";
    try (FileWriter writer = new FileWriter(graphFilePath)) {
      writer.write(graphJson);
    }
    System.out.println("✓ Exported: graph.json");

    String nodesJson = objectMapper.writeValueAsString(serializeNodes());
    String nodesFilePath = outputDir + "/nodes.json";
    try (FileWriter writer = new FileWriter(nodesFilePath)) {
      writer.write(nodesJson);
    }
    System.out.println("✓ Exported: nodes.json");

    String relsJson = objectMapper.writeValueAsString(serializeRelationships());
    String relsFilePath = outputDir + "/relationships.json";
    try (FileWriter writer = new FileWriter(relsFilePath)) {
      writer.write(relsJson);
    }
    System.out.println("✓ Exported: relationships.json");
  }

  public void exportHtml() throws IOException {
    System.out.println("\n=== Exporting HTML Files ===");

    String html = generateInteractiveHtml();
    String filePath = outputDir + "/interactive.html";
    try (FileWriter writer = new FileWriter(filePath)) {
      writer.write(html);
    }
    System.out.println("✓ Exported: interactive.html");
  }

  public void exportStatistics() throws IOException {
    System.out.println("\n=== Exporting Statistics ===");

    String stats = generateStatistics();
    String filePath = outputDir + "/statistics.md";
    try (FileWriter writer = new FileWriter(filePath)) {
      writer.write(stats);
    }
    System.out.println("✓ Exported: statistics.md");
  }

  private List<Map<String, Object>> serializeNodes() {
    return graph.getNodes().stream()
        .map(
            node -> {
              Map<String, Object> map = new LinkedHashMap<>();
              map.put("id", node.getId());
              map.put("type", node.getType());
              map.put("filePath", node.getFilePath());
              map.put("properties", node.getProperties());
              return map;
            })
        .collect(Collectors.toList());
  }

  private List<Map<String, Object>> serializeRelationships() {
    return graph.getRelationships().stream()
        .map(
            rel -> {
              Map<String, Object> map = new LinkedHashMap<>();
              map.put("sourceId", rel.getSourceId());
              map.put("targetId", rel.getTargetId());
              map.put("type", rel.getType().toString());
              map.put("label", rel.getLabel());
              return map;
            })
        .collect(Collectors.toList());
  }

  private String generateStatistics() {
    StringBuilder sb = new StringBuilder();
    sb.append("# Knowledge Graph Statistics\n\n");
    sb.append("## Overview\n\n");
    sb.append("- **Total Nodes**: ").append(graph.getNodes().size()).append("\n");
    sb.append("- **Total Relationships**: ").append(graph.getRelationships().size()).append("\n\n");

    sb.append("## Nodes by Type\n\n");
    Map<String, Long> nodesByType =
        graph.getNodes().stream()
            .collect(Collectors.groupingBy(Node::getType, Collectors.counting()));
    nodesByType.forEach(
        (type, count) -> sb.append("- **").append(type).append("**: ").append(count).append("\n"));

    sb.append("\n## Relationships by Type\n\n");
    Map<String, Long> relsByType =
        graph.getRelationships().stream()
            .collect(Collectors.groupingBy(r -> r.getType().toString(), Collectors.counting()));
    relsByType.forEach(
        (type, count) -> sb.append("- **").append(type).append("**: ").append(count).append("\n"));

    sb.append("\n## Files Exported\n\n");
    sb.append(
        "- Mermaid files: architecture.md, api-to-database.md, smart-domain.md, full-graph.md\n");
    sb.append("- JSON files: graph.json, nodes.json, relationships.json\n");
    sb.append("- HTML file: interactive.html\n");
    sb.append("- Statistics file: statistics.md\n");

    return sb.toString();
  }

  private String generateInteractiveHtml() {
    StringBuilder html = new StringBuilder();
    html.append("<!DOCTYPE html>\n");
    html.append("<html lang=\"en\">\n");
    html.append("<head>\n");
    html.append("  <meta charset=\"UTF-8\">\n");
    html.append("  <meta name=\"viewport\" content=\"width=device-width, initial-scale=1.0\">\n");
    html.append("  <title>Knowledge Graph - Interactive View</title>\n");
    html.append(
        "  <script src=\"https://cdn.jsdelivr.net/npm/mermaid@10/dist/mermaid.min.js\"></script>\n");
    html.append("  <style>\n");
    html.append("    body { font-family: Arial, sans-serif; margin: 20px; }\n");
    html.append("    .tab-container { margin-bottom: 20px; }\n");
    html.append(
        "    .tab { padding: 10px 20px; cursor: pointer; background: #eee; border: 1px solid #ccc; }\n");
    html.append("    .tab.active { background: #fff; border-bottom: none; }\n");
    html.append("    .tab-content { display: none; border: 1px solid #ccc; padding: 20px; }\n");
    html.append("    .tab-content.active { display: block; }\n");
    html.append(
        "    .stats-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 20px; }\n");
    html.append("    .stat-card { background: #f5f5f5; padding: 15px; border-radius: 5px; }\n");
    html.append("    .stat-card h3 { margin: 0 0 10px 0; color: #333; }\n");
    html.append(
        "    .stat-card p { margin: 0; font-size: 24px; font-weight: bold; color: #0066cc; }\n");
    html.append("    .node-list { max-height: 400px; overflow-y: auto; }\n");
    html.append("    .node-item { padding: 10px; border-bottom: 1px solid #eee; }\n");
    html.append("    .node-item:hover { background: #f9f9f9; }\n");
    html.append("    .node-type { font-weight: bold; color: #666; }\n");
    html.append("    .node-name { color: #333; }\n");
    html.append("    .node-file { font-size: 12px; color: #999; }\n");
    html.append(
        "    pre { background: #f5f5f5; padding: 10px; border-radius: 5px; overflow-x: auto; }\n");
    html.append("  </style>\n");
    html.append("</head>\n");
    html.append("<body>\n");
    html.append("  <h1>Knowledge Graph - Interactive View</h1>\n\n");

    html.append("  <div class=\"tab-container\">\n");
    html.append("    <div class=\"tab active\" onclick=\"showTab('overview')\">Overview</div>\n");
    html.append("    <div class=\"tab\" onclick=\"showTab('architecture')\">Architecture</div>\n");
    html.append(
        "    <div class=\"tab\" onclick=\"showTab('api-database')\">API → Database</div>\n");
    html.append("    <div class=\"tab\" onclick=\"showTab('smart-domain')\">Smart Domain</div>\n");
    html.append("    <div class=\"tab\" onclick=\"showTab('nodes')\">Nodes</div>\n");
    html.append("  </div>\n\n");

    html.append("  <div id=\"overview\" class=\"tab-content active\">\n");
    html.append("    <h2>Overview</h2>\n");
    html.append("    <div class=\"stats-grid\">\n");
    html.append("      <div class=\"stat-card\"><h3>Total Nodes</h3><p>")
        .append(graph.getNodes().size())
        .append("</p></div>\n");
    html.append("      <div class=\"stat-card\"><h3>Total Relationships</h3><p>")
        .append(graph.getRelationships().size())
        .append("</p></div>\n");
    html.append("    </div>\n");
    html.append("  </div>\n\n");

    html.append("  <div id=\"architecture\" class=\"tab-content\">\n");
    html.append("    <h2>Architecture View</h2>\n");
    html.append("    <pre class=\"mermaid\">\n");
    html.append(
        viewGenerator.generateArchitectureView().replace("```mermaid", "").replace("```", ""));
    html.append("    </pre>\n");
    html.append("  </div>\n\n");

    html.append("  <div id=\"api-database\" class=\"tab-content\">\n");
    html.append("    <h2>API → Database Flow</h2>\n");
    html.append("    <pre class=\"mermaid\">\n");
    html.append(
        viewGenerator.generateApiToDatabaseView().replace("```mermaid", "").replace("```", ""));
    html.append("    </pre>\n");
    html.append("  </div>\n\n");

    html.append("  <div id=\"smart-domain\" class=\"tab-content\">\n");
    html.append("    <h2>Smart Domain Pattern</h2>\n");
    html.append("    <pre class=\"mermaid\">\n");
    html.append(
        viewGenerator.generateSmartDomainView().replace("```mermaid", "").replace("```", ""));
    html.append("    </pre>\n");
    html.append("  </div>\n\n");

    html.append("  <div id=\"nodes\" class=\"tab-content\">\n");
    html.append("    <h2>All Nodes</h2>\n");
    html.append("    <div class=\"node-list\">\n");
    for (Node node : graph.getNodes()) {
      html.append("      <div class=\"node-item\">\n");
      html.append("        <div class=\"node-type\">").append(node.getType()).append("</div>\n");
      html.append("        <div class=\"node-name\">")
          .append(node.getProperty("name") != null ? node.getProperty("name") : node.getId())
          .append("</div>\n");
      if (node.getFilePath() != null) {
        html.append("        <div class=\"node-file\">")
            .append(node.getFilePath())
            .append("</div>\n");
      }
      html.append("      </div>\n");
    }
    html.append("    </div>\n");
    html.append("  </div>\n\n");

    html.append("  <script>\n");
    html.append("    mermaid.initialize({ startOnLoad: true, securityLevel: 'loose' });\n\n");
    html.append("    function showTab(tabId) {\n");
    html.append(
        "      document.querySelectorAll('.tab').forEach(tab => tab.classList.remove('active'));\n");
    html.append(
        "      document.querySelectorAll('.tab-content').forEach(content => content.classList.remove('active'));\n");
    html.append("      event.target.classList.add('active');\n");
    html.append("      document.getElementById(tabId).classList.add('active');\n");
    html.append("    }\n");
    html.append("  </script>\n");
    html.append("</body>\n");
    html.append("</html>\n");

    return html.toString();
  }

  private static class GraphSerializable {
    private final List<Map<String, Object>> nodes;
    private final List<Map<String, Object>> relationships;

    public GraphSerializable(Graph graph) {
      this.nodes =
          graph.getNodes().stream()
              .map(
                  node -> {
                    Map<String, Object> map = new LinkedHashMap<>();
                    map.put("id", node.getId());
                    map.put("type", node.getType());
                    map.put("filePath", node.getFilePath());
                    map.put("properties", node.getProperties());
                    return map;
                  })
              .collect(Collectors.toList());

      this.relationships =
          graph.getRelationships().stream()
              .map(
                  rel -> {
                    Map<String, Object> map = new LinkedHashMap<>();
                    map.put("sourceId", rel.getSourceId());
                    map.put("targetId", rel.getTargetId());
                    map.put("type", rel.getType().toString());
                    map.put("label", rel.getLabel());
                    return map;
                  })
              .collect(Collectors.toList());
    }

    public List<Map<String, Object>> getNodes() {
      return nodes;
    }

    public List<Map<String, Object>> getRelationships() {
      return relationships;
    }
  }
}
