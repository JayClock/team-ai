package reengineering.ddd.knowledgegraph.extractor;

import java.nio.file.Path;
import reengineering.ddd.knowledgegraph.extractor.api.ApiLayerExtractor;
import reengineering.ddd.knowledgegraph.extractor.domain.DomainLayerExtractor;
import reengineering.ddd.knowledgegraph.extractor.infrastructure.InfrastructureLayerExtractor;
import reengineering.ddd.knowledgegraph.extractor.infrastructure.XMLMapperExtractor;
import reengineering.ddd.knowledgegraph.model.*;

public class KnowledgeGraphExtractor {
  private final Graph graph;
  private final ApiLayerExtractor apiExtractor;
  private final DomainLayerExtractor domainExtractor;
  private final InfrastructureLayerExtractor infraExtractor;
  private final XMLMapperExtractor xmlExtractor;

  public KnowledgeGraphExtractor() {
    this.graph = new Graph();
    this.apiExtractor = new ApiLayerExtractor(graph);
    this.domainExtractor = new DomainLayerExtractor(graph);
    this.infraExtractor = new InfrastructureLayerExtractor(graph);
    this.xmlExtractor = new XMLMapperExtractor(graph);
  }

  public void extract(String basePath) {
    Path path = Path.of(basePath);

    createLayerNodes();

    apiExtractor.extract(path);
    domainExtractor.extract(path);
    infraExtractor.extract(path);
    xmlExtractor.extract(path);
  }

  private void createLayerNodes() {
    LayerNode apiLayer = new LayerNode(Layer.API_LAYER);
    LayerNode domainLayer = new LayerNode(Layer.DOMAIN_LAYER);
    LayerNode infraLayer = new LayerNode(Layer.INFRASTRUCTURE_LAYER);

    graph.addNode(apiLayer);
    graph.addNode(domainLayer);
    graph.addNode(infraLayer);
  }

  public Graph getGraph() {
    return graph;
  }

  public void printSummary() {
    System.out.println("=== Knowledge Graph Extraction Summary ===");
    System.out.println();

    System.out.println("Total Nodes: " + graph.getNodes().size());
    System.out.println("Total Relationships: " + graph.getRelationships().size());
    System.out.println();

    System.out.println("Nodes by Type:");
    graph.getNodes().stream()
        .collect(
            java.util.stream.Collectors.groupingBy(
                Node::getType, java.util.stream.Collectors.counting()))
        .forEach((type, count) -> System.out.println("  " + type + ": " + count));

    System.out.println();

    System.out.println("Relationships by Type:");
    graph.getRelationships().stream()
        .collect(
            java.util.stream.Collectors.groupingBy(
                Relationship::getType, java.util.stream.Collectors.counting()))
        .forEach((type, count) -> System.out.println("  " + type + ": " + count));
  }
}
