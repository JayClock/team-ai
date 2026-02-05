package reengineering.ddd.teamai.api.representation;

import com.fasterxml.jackson.annotation.JsonProperty;
import com.fasterxml.jackson.annotation.JsonUnwrapped;
import jakarta.ws.rs.core.UriInfo;
import org.springframework.hateoas.Link;
import org.springframework.hateoas.RepresentationModel;
import org.springframework.hateoas.mediatype.Affordances;
import org.springframework.hateoas.server.core.Relation;
import org.springframework.http.HttpMethod;
import reengineering.ddd.teamai.api.ApiTemplates;
import reengineering.ddd.teamai.description.DiagramDescription;
import reengineering.ddd.teamai.model.Diagram;
import reengineering.ddd.teamai.model.Project;

@Relation(collectionRelation = "diagrams")
public class DiagramModel extends RepresentationModel<DiagramModel> {
  @JsonProperty private String id;
  @JsonProperty private String type;

  @JsonUnwrapped private DiagramDescriptionWrapper description;

  private static class DiagramDescriptionWrapper {
    private final String title;
    private final ViewportModel viewport;

    DiagramDescriptionWrapper(DiagramDescription desc) {
      this.title = desc.title();
      this.viewport = new ViewportModel(desc.viewport());
    }

    public String getTitle() {
      return title;
    }

    public ViewportModel getViewport() {
      return viewport;
    }
  }

  private static class ViewportModel {
    private final double x;
    private final double y;
    private final double zoom;

    ViewportModel(reengineering.ddd.teamai.description.Viewport viewport) {
      this.x = viewport.x();
      this.y = viewport.y();
      this.zoom = viewport.zoom();
    }

    public double getX() {
      return x;
    }

    public double getY() {
      return y;
    }

    public double getZoom() {
      return zoom;
    }
  }

  public DiagramModel(Project project, Diagram entity, UriInfo uriInfo) {
    this.id = entity.getIdentity();
    this.type = entity.getDescription().type().getValue();
    this.description = new DiagramDescriptionWrapper(entity.getDescription());

    add(
        Affordances.of(
                Link.of(
                        ApiTemplates.diagram(uriInfo)
                            .build(project.getIdentity(), entity.getIdentity())
                            .getPath())
                    .withSelfRel())
            .afford(HttpMethod.PUT)
            .withInput(DiagramDescription.class)
            .andAfford(HttpMethod.DELETE)
            .withName("delete-diagram")
            .toLink());

    add(
        Link.of(ApiTemplates.diagrams(uriInfo).build(project.getIdentity()).getPath())
            .withRel("diagrams"));

    add(
        Link.of(
                ApiTemplates.nodes(uriInfo)
                    .build(project.getIdentity(), entity.getIdentity())
                    .getPath())
            .withRel("nodes"));

    add(
        Link.of(
                ApiTemplates.edges(uriInfo)
                    .build(project.getIdentity(), entity.getIdentity())
                    .getPath())
            .withRel("edges"));
  }

  public static DiagramModel simple(Project project, Diagram entity, UriInfo uriInfo) {
    DiagramModel model = new DiagramModel(project, entity, uriInfo);
    model.add(
        Link.of(
                ApiTemplates.diagram(uriInfo)
                    .build(project.getIdentity(), entity.getIdentity())
                    .getPath())
            .withSelfRel());
    return model;
  }
}
