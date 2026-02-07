package reengineering.ddd.teamai.api.representation;

import com.fasterxml.jackson.annotation.JsonProperty;
import jakarta.ws.rs.core.UriInfo;
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
import reengineering.ddd.teamai.model.Project;

@Relation(collectionRelation = "diagrams")
public class DiagramModel extends RepresentationModel<DiagramModel> {
  @JsonProperty private String id;
  @JsonProperty private String title;
  @JsonProperty private String type;
  @JsonProperty private Viewport viewport;

  public DiagramModel(Project project, Diagram diagram, UriInfo uriInfo) {
    this.id = diagram.getIdentity();
    this.title = diagram.getDescription().title();
    this.type = diagram.getDescription().type().getValue();
    this.viewport = diagram.getDescription().viewport();
  }

  public static DiagramModel of(Project project, Diagram diagram, UriInfo uriInfo) {
    DiagramModel model = new DiagramModel(project, diagram, uriInfo);

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
    return model;
  }

  public static DiagramModel simple(Project project, Diagram diagram, UriInfo uriInfo) {
    DiagramModel model = new DiagramModel(project, diagram, uriInfo);
    model.add(
        Link.of(
                ApiTemplates.diagram(uriInfo)
                    .build(project.getIdentity(), diagram.getIdentity())
                    .getPath())
            .withSelfRel());
    return model;
  }
}
