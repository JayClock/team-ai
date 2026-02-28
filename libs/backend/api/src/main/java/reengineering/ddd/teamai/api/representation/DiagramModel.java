package reengineering.ddd.teamai.api.representation;

import com.fasterxml.jackson.annotation.JsonInclude;
import com.fasterxml.jackson.annotation.JsonProperty;
import jakarta.ws.rs.core.UriInfo;
import java.util.List;
import org.springframework.hateoas.Link;
import org.springframework.hateoas.RepresentationModel;
import org.springframework.hateoas.mediatype.Affordances;
import org.springframework.hateoas.server.core.Relation;
import org.springframework.http.HttpMethod;
import reengineering.ddd.teamai.api.ApiTemplates;
import reengineering.ddd.teamai.api.DiagramApi;
import reengineering.ddd.teamai.api.EdgesApi;
import reengineering.ddd.teamai.api.NodesApi;
import reengineering.ddd.teamai.description.Viewport;
import reengineering.ddd.teamai.model.Diagram;
import reengineering.ddd.teamai.model.DiagramEdge;
import reengineering.ddd.teamai.model.DiagramNode;
import reengineering.ddd.teamai.model.Project;

@Relation(collectionRelation = "diagrams")
public class DiagramModel extends RepresentationModel<DiagramModel> {
  @JsonProperty private String id;
  @JsonProperty private String title;
  @JsonProperty private String type;
  @JsonProperty private String status;
  @JsonProperty private Viewport viewport;

  @JsonInclude(JsonInclude.Include.NON_NULL)
  @JsonProperty("_embedded")
  private EmbeddedResources embedded;

  public DiagramModel(
      Project project,
      Diagram diagram,
      List<DiagramNode> nodes,
      List<DiagramEdge> edges,
      UriInfo uriInfo) {
    this.id = diagram.getIdentity();
    this.title = diagram.getDescription().title();
    this.type = diagram.getDescription().type().getValue();
    this.status = diagram.getDescription().status().getValue();
    this.viewport = diagram.getDescription().viewport();
    this.embedded =
        nodes == null && edges == null
            ? null
            : new EmbeddedResources(
                nodes == null
                    ? List.of()
                    : nodes.stream()
                        .map(node -> DiagramNodeModel.of(project, diagram, node, uriInfo))
                        .toList(),
                edges == null
                    ? List.of()
                    : edges.stream()
                        .map(edge -> DiagramEdgeModel.simple(project, diagram, edge, uriInfo))
                        .toList());
  }

  public static DiagramModel of(Project project, Diagram diagram, UriInfo uriInfo) {
    var nodes = diagram.nodes().findAll();
    var edges = diagram.edges().findAll();
    DiagramModel model =
        new DiagramModel(
            project,
            diagram,
            nodes == null ? null : nodes.stream().toList(),
            edges == null ? null : edges.stream().toList(),
            uriInfo);
    model.add(
        Link.of(ApiTemplates.project(uriInfo).build(project.getIdentity()).getPath())
            .withRel("project"));
    model.add(
        Link.of(ApiTemplates.diagrams(uriInfo).build(project.getIdentity()).getPath())
            .withRel("collection"));

    model.add(
        Affordances.of(
                Link.of(
                        ApiTemplates.diagram(uriInfo)
                            .build(project.getIdentity(), diagram.getIdentity())
                            .getPath())
                    .withSelfRel())
            .afford(HttpMethod.PUT)
            .withInput(DiagramApi.UpdateDiagramApi.class)
            .andAfford(HttpMethod.DELETE)
            .withName("delete-diagram")
            .toLink());

    model.add(
        Affordances.of(
                Link.of(
                        ApiTemplates.nodes(uriInfo)
                            .build(project.getIdentity(), diagram.getIdentity())
                            .getPath())
                    .withRel("nodes"))
            .afford(HttpMethod.POST)
            .withInput(NodesApi.CreateNodeRequest.class)
            .withName("create-node")
            .toLink());

    model.add(
        Affordances.of(
                Link.of(
                        ApiTemplates.edges(uriInfo)
                            .build(project.getIdentity(), diagram.getIdentity())
                            .getPath())
                    .withRel("edges"))
            .afford(HttpMethod.POST)
            .withInput(EdgesApi.CreateEdgeRequest.class)
            .withName("create-edge")
            .toLink());

    model.add(
        Affordances.of(
                Link.of(
                        ApiTemplates.versions(uriInfo)
                            .build(project.getIdentity(), diagram.getIdentity())
                            .getPath())
                    .withRel("versions"))
            .afford(HttpMethod.POST)
            .withName("create-version")
            .toLink());

    model.add(
        Affordances.of(
                Link.of(
                        ApiTemplates.proposeModel(uriInfo)
                            .build(project.getIdentity(), diagram.getIdentity())
                            .getPath())
                    .withRel("propose-model"))
            .afford(HttpMethod.POST)
            .withInput(DiagramApi.ProposeModelRequest.class)
            .withName("propose-model")
            .toLink());

    model.add(
        Affordances.of(
                Link.of(
                        ApiTemplates.commitDraft(uriInfo)
                            .build(project.getIdentity(), diagram.getIdentity())
                            .getPath())
                    .withRel("commit-draft"))
            .afford(HttpMethod.POST)
            .withInput(DiagramApi.CommitDraftRequest.class)
            .withName("commit-draft")
            .toLink());

    model.add(
        Affordances.of(
                Link.of(
                        ApiTemplates.publishDiagram(uriInfo)
                            .build(project.getIdentity(), diagram.getIdentity())
                            .getPath())
                    .withRel("publish"))
            .afford(HttpMethod.POST)
            .withName("publish-diagram")
            .toLink());
    return model;
  }

  public static DiagramModel simple(Project project, Diagram diagram, UriInfo uriInfo) {
    DiagramModel model = new DiagramModel(project, diagram, null, null, uriInfo);
    model.add(
        Link.of(ApiTemplates.project(uriInfo).build(project.getIdentity()).getPath())
            .withRel("project"));
    model.add(
        Link.of(
                ApiTemplates.diagram(uriInfo)
                    .build(project.getIdentity(), diagram.getIdentity())
                    .getPath())
            .withSelfRel());
    return model;
  }

  private record EmbeddedResources(
      @JsonProperty("nodes") List<DiagramNodeModel> nodes,
      @JsonProperty("edges") List<DiagramEdgeModel> edges) {}
}
