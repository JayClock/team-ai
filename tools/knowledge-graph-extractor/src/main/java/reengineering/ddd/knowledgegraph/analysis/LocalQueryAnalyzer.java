package reengineering.ddd.knowledgegraph.analysis;

import java.util.*;
import java.util.stream.Collectors;
import reengineering.ddd.knowledgegraph.model.*;

public class LocalQueryAnalyzer {
  private final Graph graph;

  public LocalQueryAnalyzer(Graph graph) {
    this.graph = graph;
  }

  public QueryResult findApiToDomainFlow() {
    QueryResult result = new QueryResult("API → Domain Flow");

    List<Node> apiResources =
        graph.getNodes().stream()
            .filter(n -> n.getType().equals("JAXRSResource"))
            .collect(Collectors.toList());

    for (Node api : apiResources) {
      List<Relationship> injectRels = graph.getOutgoingRelationships(api.getId());
      for (Relationship rel : injectRels) {
        if (rel.getType() == Relationship.Type.INJECTS) {
          Node domain = graph.getNode(rel.getTargetId());
          if (domain != null && domain.getType().equals("Entity")) {
            result.addRow(api, "INJECTS", domain);

            List<Relationship> methodRels = graph.getOutgoingRelationships(api.getId());
            for (Relationship methodRel : methodRels) {
              if (methodRel.getType() == Relationship.Type.CONTAINS) {
                Node apiMethod = graph.getNode(methodRel.getTargetId());
                if (apiMethod != null && apiMethod.getType().equals("Method")) {
                  List<Relationship> callsRels = graph.getOutgoingRelationships(apiMethod.getId());
                  for (Relationship callsRel : callsRels) {
                    if (callsRel.getType() == Relationship.Type.CALLS) {
                      Node domainMethod = graph.getNode(callsRel.getTargetId());
                      if (domainMethod != null && domainMethod.getType().equals("Method")) {
                        result.addRow(apiMethod, "CALLS", domainMethod);
                      }
                    }
                  }
                }
              }
            }
          }
        }
      }
    }

    return result;
  }

  public QueryResult findSmartDomainAssociations() {
    QueryResult result = new QueryResult("Smart Domain Associations");

    List<Node> entities =
        graph.getNodes().stream()
            .filter(n -> n.getType().equals("Entity"))
            .collect(Collectors.toList());

    for (Node entity : entities) {
      List<Relationship> containsRels = graph.getOutgoingRelationships(entity.getId());
      for (Relationship rel : containsRels) {
        if (rel.getType() == Relationship.Type.CONTAINS) {
          Node assocInterface = graph.getNode(rel.getTargetId());
          if (assocInterface != null
              && assocInterface.getType().equals("DomainInterface")
              && assocInterface.getProperty("type") != null
              && assocInterface.getProperty("type").equals("Association")) {

            List<Relationship> implRels = graph.getIncomingRelationships(assocInterface.getId());
            for (Relationship implRel : implRels) {
              if (implRel.getType() == Relationship.Type.IMPLEMENTED_BY) {
                Node assocImpl = graph.getNode(implRel.getSourceId());
                if (assocImpl != null && assocImpl.getType().equals("AssociationImplementation")) {
                  List<Relationship> injectRels = graph.getOutgoingRelationships(assocImpl.getId());
                  for (Relationship injectRel : injectRels) {
                    if (injectRel.getType() == Relationship.Type.INJECTS) {
                      Node mapper = graph.getNode(injectRel.getTargetId());
                      if (mapper != null && mapper.getType().equals("MyBatisMapper")) {
                        List<Relationship> xmlRels = graph.getIncomingRelationships(mapper.getId());
                        for (Relationship xmlRel : xmlRels) {
                          if (xmlRel.getType() == Relationship.Type.BINDS_TO) {
                            Node xmlMapper = graph.getNode(xmlRel.getSourceId());
                            if (xmlMapper != null && xmlMapper.getType().equals("XMLMapper")) {
                              result.addRow(entity, "contains", assocInterface);
                              result.addRow(assocInterface, "implemented_by", assocImpl);
                              result.addRow(assocImpl, "injects", mapper);
                              result.addRow(mapper, "binds_to", xmlMapper);
                            }
                          }
                        }
                      }
                    }
                  }
                }
              }
            }
          }
        }
      }
    }

    return result;
  }

  public QueryResult findArchitectureViolations() {
    QueryResult result = new QueryResult("Architecture Violations");

    List<Node> infraNodes =
        graph.getNodes().stream()
            .filter(
                n -> {
                  String layer =
                      n.getProperty("layer") != null ? n.getProperty("layer").toString() : "";
                  return layer.equals(Layer.INFRASTRUCTURE_LAYER.name());
                })
            .collect(Collectors.toList());

    for (Node infra : infraNodes) {
      List<Relationship> outgoing = graph.getOutgoingRelationships(infra.getId());
      for (Relationship rel : outgoing) {
        if (rel.getType() == Relationship.Type.INJECTS
            || rel.getType() == Relationship.Type.CALLS) {
          Node target = graph.getNode(rel.getTargetId());
          if (target != null) {
            String targetLayer =
                target.getProperty("layer") != null ? target.getProperty("layer").toString() : "";
            if (targetLayer.equals(Layer.DOMAIN_LAYER.name())) {
              result.addRow(infra, rel.getType().toString(), target);
            }
          }
        }
      }
    }

    return result;
  }

  public QueryResult analyzeImpact(String nodeId) {
    QueryResult result = new QueryResult("Impact Analysis: " + nodeId);

    Node targetNode = graph.getNode(nodeId);
    if (targetNode == null) {
      result.addRow(null, "ERROR", "Node not found: " + nodeId);
      return result;
    }

    Set<String> visited = new HashSet<>();
    findImpactedNodes(nodeId, visited, result);

    return result;
  }

  private void findImpactedNodes(String nodeId, Set<String> visited, QueryResult result) {
    if (visited.contains(nodeId)) {
      return;
    }
    visited.add(nodeId);

    List<Relationship> incoming = graph.getIncomingRelationships(nodeId);
    for (Relationship rel : incoming) {
      Node source = graph.getNode(rel.getSourceId());
      if (source != null) {
        result.addRow(source, "depends_on", graph.getNode(nodeId));
        findImpactedNodes(source.getId(), visited, result);
      }
    }
  }

  public QueryResult findUnusedEntities() {
    QueryResult result = new QueryResult("Unused Entities");

    List<Node> entities =
        graph.getNodes().stream()
            .filter(n -> n.getType().equals("Entity"))
            .collect(Collectors.toList());

    List<Node> apiResources =
        graph.getNodes().stream()
            .filter(n -> n.getType().equals("JAXRSResource"))
            .collect(Collectors.toList());

    Set<String> usedEntities = new HashSet<>();

    for (Node api : apiResources) {
      List<Relationship> injectRels = graph.getOutgoingRelationships(api.getId());
      for (Relationship rel : injectRels) {
        if (rel.getType() == Relationship.Type.INJECTS) {
          Node target = graph.getNode(rel.getTargetId());
          if (target != null && target.getType().equals("Entity")) {
            usedEntities.add(target.getId());
          }
        }
      }
    }

    for (Node entity : entities) {
      if (!usedEntities.contains(entity.getId())) {
        result.addRow(entity, "not_used", "any API resource");
      }
    }

    return result;
  }

  public QueryResult findNodeById(String nodeId) {
    QueryResult result = new QueryResult("Node Lookup: " + nodeId);

    Node node = graph.getNode(nodeId);
    if (node == null) {
      result.addRow(null, "ERROR", "Node not found: " + nodeId);
      return result;
    }

    result.addRow(node, "type", node.getType());

    if (node.getFilePath() != null) {
      result.addRow(node, "file_path", node.getFilePath());
    }

    for (Map.Entry<String, Object> entry : node.getProperties().entrySet()) {
      result.addRow(node, entry.getKey(), entry.getValue().toString());
    }

    return result;
  }

  public QueryResult findIncomingRelationships(String nodeId) {
    QueryResult result = new QueryResult("Incoming Relationships: " + nodeId);

    Node node = graph.getNode(nodeId);
    if (node == null) {
      result.addRow(null, "ERROR", "Node not found: " + nodeId);
      return result;
    }

    List<Relationship> incoming = graph.getIncomingRelationships(nodeId);
    for (Relationship rel : incoming) {
      Node source = graph.getNode(rel.getSourceId());
      result.addRow(source, rel.getType().toString(), node);
    }

    return result;
  }

  public QueryResult findOutgoingRelationships(String nodeId) {
    QueryResult result = new QueryResult("Outgoing Relationships: " + nodeId);

    Node node = graph.getNode(nodeId);
    if (node == null) {
      result.addRow(null, "ERROR", "Node not found: " + nodeId);
      return result;
    }

    List<Relationship> outgoing = graph.getOutgoingRelationships(nodeId);
    for (Relationship rel : outgoing) {
      Node target = graph.getNode(rel.getTargetId());
      result.addRow(node, rel.getType().toString(), target);
    }

    return result;
  }

  public static class QueryResult {
    private final String queryName;
    private final List<QueryRow> rows;

    public QueryResult(String queryName) {
      this.queryName = queryName;
      this.rows = new ArrayList<>();
    }

    public void addRow(Node source, String relationship, Object target) {
      rows.add(new QueryRow(source, relationship, target));
    }

    public List<QueryRow> getRows() {
      return rows;
    }

    public String getQueryName() {
      return queryName;
    }

    public boolean isEmpty() {
      return rows.isEmpty();
    }

    public int size() {
      return rows.size();
    }

    public void print() {
      System.out.println("\n=== " + queryName + " ===");
      if (isEmpty()) {
        System.out.println("No results found.");
      } else {
        System.out.println("Found " + size() + " result(s):\n");
        for (int i = 0; i < rows.size(); i++) {
          QueryRow row = rows.get(i);
          System.out.println((i + 1) + ". " + row.toString());
        }
      }
    }

    public String toMarkdown() {
      StringBuilder sb = new StringBuilder();
      sb.append("# ").append(queryName).append("\n\n");

      if (isEmpty()) {
        sb.append("No results found.\n");
      } else {
        sb.append("Found ").append(size()).append(" result(s):\n\n");
        for (int i = 0; i < rows.size(); i++) {
          QueryRow row = rows.get(i);
          sb.append("**").append(i + 1).append("**. ").append(row.toMarkdown()).append("\n\n");
        }
      }

      return sb.toString();
    }
  }

  public static class QueryRow {
    private final Node source;
    private final String relationship;
    private final Object target;

    public QueryRow(Node source, String relationship, Object target) {
      this.source = source;
      this.relationship = relationship;
      this.target = target;
    }

    public Node getSource() {
      return source;
    }

    public String getRelationship() {
      return relationship;
    }

    public Object getTarget() {
      return target;
    }

    @Override
    public String toString() {
      String sourceStr = source != null ? formatNode(source) : "null";
      String targetStr = target instanceof Node ? formatNode((Node) target) : target.toString();
      return String.format("%s --[%s]--> %s", sourceStr, relationship, targetStr);
    }

    public String toMarkdown() {
      String sourceStr = source != null ? formatNodeMarkdown(source) : "null";
      String targetStr =
          target instanceof Node ? formatNodeMarkdown((Node) target) : target.toString();
      return String.format("%s --[%s]--> %s", sourceStr, relationship, targetStr);
    }

    private String formatNode(Node node) {
      String name =
          node.getProperty("name") != null ? node.getProperty("name").toString() : node.getId();
      String type = node.getType();
      return String.format("%s (%s)", name, type);
    }

    private String formatNodeMarkdown(Node node) {
      String name =
          node.getProperty("name") != null ? node.getProperty("name").toString() : node.getId();
      String type = node.getType();
      String filePath = node.getFilePath();
      if (filePath != null) {
        String fileUri = filePath.replace("\\", "/");
        return String.format("[%s (%s)](file:///%s)", name, type, fileUri);
      }
      return String.format("%s (%s)", name, type);
    }
  }
}
