package reengineering.ddd.teamai.api.representation;

import com.fasterxml.jackson.annotation.JsonProperty;
import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import jakarta.ws.rs.core.UriInfo;
import java.util.Map;
import org.springframework.hateoas.Link;
import org.springframework.hateoas.RepresentationModel;
import org.springframework.hateoas.mediatype.Affordances;
import org.springframework.hateoas.server.core.Relation;
import org.springframework.http.HttpMethod;
import reengineering.ddd.archtype.JsonBlob;
import reengineering.ddd.teamai.api.ApiTemplates;
import reengineering.ddd.teamai.description.NodeDescription;
import reengineering.ddd.teamai.model.Diagram;
import reengineering.ddd.teamai.model.DiagramNode;
import reengineering.ddd.teamai.model.Project;

@Relation(collectionRelation = "nodes")
public class DiagramNodeModel extends RepresentationModel<DiagramNodeModel> {
  @JsonProperty private String id;
  @JsonProperty private String type;
  @JsonProperty private String logicalEntityId;

  @JsonProperty("_embedded")
  private EmbeddedResources embedded;

  @JsonProperty private String parentId;
  @JsonProperty private double positionX;
  @JsonProperty private double positionY;
  @JsonProperty private Integer width;
  @JsonProperty private Integer height;
  @JsonProperty private Map<String, Object> styleConfig;
  @JsonProperty private Map<String, Object> localData;

  public record EmbeddedResources(
      @JsonProperty("logical-entity") LogicalEntityModel logicalEntity) {}

  private static final ObjectMapper objectMapper = new ObjectMapper();

  public DiagramNodeModel(
      Project project, Diagram diagram, DiagramNode diagramNode, UriInfo uriInfo) {
    NodeDescription desc = diagramNode.getDescription();
    this.id = diagramNode.getIdentity();
    this.type = desc.type();
    this.logicalEntityId = desc.logicalEntity() != null ? desc.logicalEntity().id() : null;
    this.embedded =
        diagramNode.logicalEntity() != null
            ? new EmbeddedResources(
                LogicalEntityModel.of(project, diagramNode.logicalEntity(), uriInfo))
            : null;
    this.parentId = desc.parent() != null ? desc.parent().id() : null;
    this.positionX = desc.positionX();
    this.positionY = desc.positionY();
    this.width = desc.width();
    this.height = desc.height();
    this.styleConfig = parseJsonBlob(desc.styleConfig());
    this.localData = parseJsonBlob(desc.localData());
  }

  private Map<String, Object> parseJsonBlob(JsonBlob blob) {
    if (blob == null || blob.json() == null || blob.json().isEmpty()) {
      return Map.of();
    }
    try {
      return objectMapper.readValue(blob.json(), new TypeReference<Map<String, Object>>() {});
    } catch (Exception e) {
      return Map.of();
    }
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

    if (diagramNode.getDescription().logicalEntity() != null) {
      model.add(
          Link.of(
                  ApiTemplates.logicalEntity(uriInfo)
                      .build(
                          project.getIdentity(), diagramNode.getDescription().logicalEntity().id())
                      .getPath())
              .withRel("logical-entity"));
    }

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
}
