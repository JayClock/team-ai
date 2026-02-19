package reengineering.ddd.teamai.model;

import java.util.Collection;
import java.util.List;
import reactor.core.publisher.Flux;
import reengineering.ddd.archtype.Entity;
import reengineering.ddd.archtype.HasMany;
import reengineering.ddd.teamai.description.DiagramDescription;
import reengineering.ddd.teamai.description.DiagramVersionDescription;
import reengineering.ddd.teamai.description.DiagramVersionDescription.DiagramSnapshot;
import reengineering.ddd.teamai.description.EdgeDescription;
import reengineering.ddd.teamai.description.NodeDescription;

public class Diagram implements Entity<String, DiagramDescription> {
  private String identity;
  private DiagramDescription description;
  private Nodes nodes;
  private Edges edges;
  private Versions versions;

  public Diagram(
      String identity,
      DiagramDescription description,
      Nodes nodes,
      Edges edges,
      Versions versions) {
    this.identity = identity;
    this.description = description;
    this.nodes = nodes;
    this.edges = edges;
    this.versions = versions;
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

  public HasMany<String, DiagramVersion> versions() {
    return versions;
  }

  public DiagramNode addNode(NodeDescription description) {
    return nodes.add(description);
  }

  public DiagramEdge addEdge(EdgeDescription description) {
    return edges.add(description);
  }

  public List<DiagramNode> addNodes(Collection<NodeDescription> descriptions) {
    return descriptions == null || descriptions.isEmpty() ? List.of() : nodes.addAll(descriptions);
  }

  public List<DiagramEdge> addEdges(Collection<EdgeDescription> descriptions) {
    return descriptions == null || descriptions.isEmpty() ? List.of() : edges.addAll(descriptions);
  }

  public DiagramVersion createVersion() {
    DiagramSnapshot snapshot =
        new DiagramSnapshot(
            nodes.findAll().stream()
                .map(
                    node ->
                        new DiagramSnapshot.SnapshotNode(node.getIdentity(), node.getDescription()))
                .toList(),
            edges.findAll().stream()
                .map(
                    edge ->
                        new DiagramSnapshot.SnapshotEdge(edge.getIdentity(), edge.getDescription()))
                .toList(),
            description.viewport());
    String versionName = "v" + (versions.findAll().size() + 1);
    return versions.add(new DiagramVersionDescription(versionName, snapshot));
  }

  public interface Nodes extends HasMany<String, DiagramNode> {
    DiagramNode add(NodeDescription description);

    List<DiagramNode> addAll(Collection<NodeDescription> descriptions);
  }

  public interface Edges extends HasMany<String, DiagramEdge> {
    DiagramEdge add(EdgeDescription description);

    List<DiagramEdge> addAll(Collection<EdgeDescription> descriptions);
  }

  public interface Versions extends HasMany<String, DiagramVersion> {
    DiagramVersion add(DiagramVersionDescription description);
  }

  public Flux<String> proposeModel(String requirement, DomainArchitect architect) {
    return architect.proposeModel(requirement);
  }

  public interface DomainArchitect {
    Flux<String> proposeModel(String requirement);
  }

  public enum Type {
    FLOWCHART("flowchart"),
    SEQUENCE("sequence"),
    CLASS("class"),
    COMPONENT("component"),
    STATE("state"),
    ACTIVITY("activity"),
    FULFILLMENT("fulfillment");

    private final String value;

    Type(String value) {
      this.value = value;
    }

    public String getValue() {
      return value;
    }

    public static Type fromValue(String value) {
      for (Type type : values()) {
        if (type.value.equals(value)) {
          return type;
        }
      }
      throw new IllegalArgumentException("Unknown diagram type: " + value);
    }
  }

  public enum Status {
    DRAFT("draft"),
    PUBLISHED("published");

    private final String value;

    Status(String value) {
      this.value = value;
    }

    public String getValue() {
      return value;
    }

    public static Status fromValue(String value) {
      for (Status status : values()) {
        if (status.value.equals(value)) {
          return status;
        }
      }
      throw new IllegalArgumentException("Unknown diagram status: " + value);
    }
  }
}
