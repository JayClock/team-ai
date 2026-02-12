package reengineering.ddd.teamai.model;

import reengineering.ddd.archtype.Entity;
import reengineering.ddd.archtype.HasMany;
import reengineering.ddd.teamai.description.DiagramDescription;
import reengineering.ddd.teamai.description.EdgeDescription;
import reengineering.ddd.teamai.description.NodeDescription;

public class Diagram implements Entity<String, DiagramDescription> {
  private String identity;
  private DiagramDescription description;
  private Nodes nodes;
  private Edges edges;

  public Diagram(String identity, DiagramDescription description, Nodes nodes, Edges edges) {
    this.identity = identity;
    this.description = description;
    this.nodes = nodes;
    this.edges = edges;
  }

  private Diagram() {}

  @Override
  public String getIdentity() {
    return identity;
  }

  @Override
  public DiagramDescription getDescription() {
    return description;
  }

  public HasMany<String, DiagramNode> nodes() {
    return nodes;
  }

  public HasMany<String, DiagramEdge> edges() {
    return edges;
  }

  public DiagramNode addNode(NodeDescription description) {
    return nodes.add(description);
  }

  public DiagramEdge addEdge(EdgeDescription description) {
    return edges.add(description);
  }

  public interface Nodes extends HasMany<String, DiagramNode> {
    DiagramNode add(NodeDescription description);
  }

  public interface Edges extends HasMany<String, DiagramEdge> {
    DiagramEdge add(EdgeDescription description);
  }

  public DiagramDescription.DraftDiagram proposeModel(
      String requirement, DomainArchitect architect) {
    return architect.proposeModel(requirement);
  }

  public interface DomainArchitect {
    DiagramDescription.DraftDiagram proposeModel(String requirement);
  }
}
