package reengineering.ddd.teamai.api.representation;

import com.fasterxml.jackson.annotation.JsonProperty;
import jakarta.ws.rs.core.UriInfo;
import org.springframework.hateoas.Link;
import org.springframework.hateoas.RepresentationModel;
import org.springframework.hateoas.mediatype.Affordances;
import org.springframework.hateoas.server.core.Relation;
import org.springframework.http.HttpMethod;
import reengineering.ddd.teamai.api.ApiTemplates;
import reengineering.ddd.teamai.description.EdgeDescription;
import reengineering.ddd.teamai.description.EdgeStyleProps;
import reengineering.ddd.teamai.model.Diagram;
import reengineering.ddd.teamai.model.DiagramEdge;
import reengineering.ddd.teamai.model.Project;

@Relation(collectionRelation = "edges")
public class DiagramEdgeModel extends RepresentationModel<DiagramEdgeModel> {
  @JsonProperty private String id;
  @JsonProperty private String sourceNodeId;
  @JsonProperty private String targetNodeId;
  @JsonProperty private String sourceHandle;
  @JsonProperty private String targetHandle;
  @JsonProperty private String relationType;
  @JsonProperty private String label;
  @JsonProperty private StylePropsModel styleProps;

  private static class StylePropsModel {
    private final String lineStyle;
    private final String color;
    private final String arrowType;
    private final Integer lineWidth;

    StylePropsModel(EdgeStyleProps props) {
      if (props != null) {
        this.lineStyle = props.lineStyle();
        this.color = props.color();
        this.arrowType = props.arrowType();
        this.lineWidth = props.lineWidth();
      } else {
        this.lineStyle = null;
        this.color = null;
        this.arrowType = null;
        this.lineWidth = null;
      }
    }

    public String getLineStyle() {
      return lineStyle;
    }

    public String getColor() {
      return color;
    }

    public String getArrowType() {
      return arrowType;
    }

    public Integer getLineWidth() {
      return lineWidth;
    }
  }

  public DiagramEdgeModel(Project project, Diagram diagram, DiagramEdge entity, UriInfo uriInfo) {
    EdgeDescription desc = entity.getDescription();
    this.id = entity.getIdentity();
    this.sourceNodeId = desc.sourceNode() != null ? desc.sourceNode().id() : null;
    this.targetNodeId = desc.targetNode() != null ? desc.targetNode().id() : null;
    this.sourceHandle = desc.sourceHandle();
    this.targetHandle = desc.targetHandle();
    this.relationType = desc.relationType() != null ? desc.relationType().getValue() : null;
    this.label = desc.label();
    this.styleProps = new StylePropsModel(desc.styleProps());

    add(
        Affordances.of(
                Link.of(
                        ApiTemplates.edge(uriInfo)
                            .build(
                                project.getIdentity(), diagram.getIdentity(), entity.getIdentity())
                            .getPath())
                    .withSelfRel())
            .afford(HttpMethod.PUT)
            .withInput(EdgeDescription.class)
            .andAfford(HttpMethod.DELETE)
            .withName("delete-edge")
            .toLink());

    add(
        Link.of(
                ApiTemplates.edges(uriInfo)
                    .build(project.getIdentity(), diagram.getIdentity())
                    .getPath())
            .withRel("edges"));

    add(
        Link.of(
                ApiTemplates.diagram(uriInfo)
                    .build(project.getIdentity(), diagram.getIdentity())
                    .getPath())
            .withRel("diagram"));
  }

  public static DiagramEdgeModel simple(
      Project project, Diagram diagram, DiagramEdge entity, UriInfo uriInfo) {
    DiagramEdgeModel model = new DiagramEdgeModel(project, diagram, entity, uriInfo);
    model.add(
        Link.of(
                ApiTemplates.edge(uriInfo)
                    .build(project.getIdentity(), diagram.getIdentity(), entity.getIdentity())
                    .getPath())
            .withSelfRel());
    return model;
  }
}
