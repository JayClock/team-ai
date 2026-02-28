package reengineering.ddd.teamai.api.representation;

import com.fasterxml.jackson.annotation.JsonInclude;
import com.fasterxml.jackson.annotation.JsonProperty;
import jakarta.ws.rs.core.UriInfo;
import java.util.Map;
import org.springframework.hateoas.Link;
import org.springframework.hateoas.RepresentationModel;
import org.springframework.hateoas.mediatype.Affordances;
import org.springframework.hateoas.server.core.Relation;
import org.springframework.http.HttpMethod;
import reengineering.ddd.archtype.Ref;
import reengineering.ddd.teamai.api.ApiTemplates;
import reengineering.ddd.teamai.description.NodeDescription;
import reengineering.ddd.teamai.model.Diagram;
import reengineering.ddd.teamai.model.DiagramNode;
import reengineering.ddd.teamai.model.LogicalEntity;
import reengineering.ddd.teamai.model.Project;

@Relation(collectionRelation = "nodes")
public class DiagramNodeModel extends RepresentationModel<DiagramNodeModel> {
  @JsonProperty private String id;
  @JsonProperty private String type;
  @JsonProperty private Ref<String> logicalEntity;
  @JsonProperty private Ref<String> parent;
  @JsonProperty private double positionX;
  @JsonProperty private double positionY;
  @JsonProperty private Integer width;
  @JsonProperty private Integer height;
  @JsonProperty private Map<String, Object> styleConfig;
  @JsonProperty private Map<String, Object> localData;

  @JsonInclude(JsonInclude.Include.NON_NULL)
  @JsonProperty("_embedded")
  private EmbeddedResources embedded;

  public DiagramNodeModel(
      Project project, Diagram diagram, DiagramNode diagramNode, UriInfo uriInfo) {
    NodeDescription description = diagramNode.getDescription();
    LogicalEntity logicalEntity = diagramNode.logicalEntity();
    this.id = diagramNode.getIdentity();
    this.type = description.type();
    this.logicalEntity = description.logicalEntity();
    this.embedded =
        logicalEntity != null
            ? new EmbeddedResources(LogicalEntityModel.of(project, logicalEntity, uriInfo))
            : null;
    this.parent = description.parent();
    this.positionX = description.positionX();
    this.positionY = description.positionY();
    this.width = description.width();
    this.height = description.height();
    this.styleConfig = JsonBlobReader.read(description.styleConfig());
    this.localData = JsonBlobReader.read(description.localData());
  }

  public static DiagramNodeModel of(
      Project project, Diagram diagram, DiagramNode diagramNode, UriInfo uriInfo) {
    DiagramNodeModel model = new DiagramNodeModel(project, diagram, diagramNode, uriInfo);
    model.add(
        Affordances.of(
                Link.of(
                        ApiTemplates.node(uriInfo)
                            .build(
                                project.getIdentity(),
                                diagram.getIdentity(),
                                diagramNode.getIdentity())
                            .getPath())
                    .withSelfRel())
            .afford(HttpMethod.PUT)
            .withInput(NodeDescription.class)
            .andAfford(HttpMethod.DELETE)
            .withName("delete-node")
            .toLink());

    LogicalEntity logicalEntity = diagramNode.logicalEntity();
    if (logicalEntity != null) {
      model.add(
          Link.of(
                  ApiTemplates.logicalEntity(uriInfo)
                      .build(project.getIdentity(), logicalEntity.getIdentity())
                      .getPath())
              .withRel("logical-entity"));
    }

    model.add(
        Link.of(
                ApiTemplates.nodes(uriInfo)
                    .build(project.getIdentity(), diagram.getIdentity())
                    .getPath())
            .withRel("collection"));

    return model;
  }

  public static DiagramNodeModel simple(
      Project project, Diagram diagram, DiagramNode diagramNode, UriInfo uriInfo) {
    DiagramNodeModel model = new DiagramNodeModel(project, diagram, diagramNode, uriInfo);
    model.add(
        Link.of(
                ApiTemplates.node(uriInfo)
                    .build(project.getIdentity(), diagram.getIdentity(), diagramNode.getIdentity())
                    .getPath())
            .withSelfRel());
    return model;
  }

  private record EmbeddedResources(
      @JsonProperty("logical-entity") LogicalEntityModel logicalEntity) {}
}
