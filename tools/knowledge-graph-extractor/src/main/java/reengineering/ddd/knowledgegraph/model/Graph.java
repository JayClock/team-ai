package reengineering.ddd.knowledgegraph.model;

import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

public class Graph {
  private final Map<String, Node> nodes;
  private final List<Relationship> relationships;

  public Graph() {
    this.nodes = new HashMap<>();
    this.relationships = new ArrayList<>();
  }

  public void addNode(Node node) {
    nodes.put(node.getId(), node);
  }

  public void addRelationship(Relationship relationship) {
    relationships.add(relationship);
  }

  public Node getNode(String id) {
    return nodes.get(id);
  }

  public List<Node> getNodes() {
    return new ArrayList<>(nodes.values());
  }

  public List<Relationship> getRelationships() {
    return new ArrayList<>(relationships);
  }

  public List<Relationship> getRelationshipsByType(Relationship.Type type) {
    return relationships.stream().filter(r -> r.getType() == type).toList();
  }

  public List<Relationship> getOutgoingRelationships(String nodeId) {
    return relationships.stream().filter(r -> r.getSourceId().equals(nodeId)).toList();
  }

  public List<Relationship> getIncomingRelationships(String nodeId) {
    return relationships.stream().filter(r -> r.getTargetId().equals(nodeId)).toList();
  }
}
