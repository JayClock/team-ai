package com.businessdrivenai.api.representation;

import com.businessdrivenai.api.ApiTemplates;
import com.businessdrivenai.api.EdgesApi;
import com.businessdrivenai.domain.description.EdgeDescription;
import com.businessdrivenai.domain.description.EdgeStyleProps;
import com.businessdrivenai.domain.model.Diagram;
import com.businessdrivenai.domain.model.DiagramEdge;
import com.businessdrivenai.domain.model.Project;
import com.fasterxml.jackson.annotation.JsonProperty;
import jakarta.ws.rs.core.UriInfo;
import org.springframework.hateoas.Link;
import org.springframework.hateoas.RepresentationModel;
import org.springframework.hateoas.mediatype.Affordances;
import org.springframework.hateoas.server.core.Relation;
import org.springframework.http.HttpMethod;

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
    this.relationType = desc.relationType();
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

    add(
        Link.of(
                ApiTemplates.diagram(uriInfo)
                    .build(project.getIdentity(), diagram.getIdentity())
                    .getPath())
            .withRel("diagram"));
  }

  public static DiagramEdgeModel simple(
      Project project, Diagram diagram, DiagramEdge diagramEdge, UriInfo uriInfo) {
    DiagramEdgeModel model = new DiagramEdgeModel(project, diagram, diagramEdge, uriInfo);
    model.add(
        Link.of(
                ApiTemplates.edge(uriInfo)
                    .build(project.getIdentity(), diagram.getIdentity(), diagramEdge.getIdentity())
                    .getPath())
            .withSelfRel());
    return model;
  }
}
