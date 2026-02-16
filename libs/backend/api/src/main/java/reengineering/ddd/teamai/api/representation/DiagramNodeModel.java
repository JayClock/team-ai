package reengineering.ddd.teamai.api.representation;

import com.fasterxml.jackson.annotation.JsonInclude;
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

  @JsonInclude(JsonInclude.Include.NON_NULL)
  @JsonProperty("_embedded")
  private EmbeddedResources embedded;

  @JsonProperty private Ref<String> parent;
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
    String logicalEntityId = resolveLogicalEntityId(diagramNode);
    LogicalEntity logicalEntity = diagramNode.logicalEntity();
    this.id = diagramNode.getIdentity();
    this.type = desc.type();
    this.logicalEntity = logicalEntityId == null ? null : new Ref<>(logicalEntityId);
    this.embedded =
        logicalEntityId != null && logicalEntity != null
            ? new EmbeddedResources(LogicalEntityModel.of(project, logicalEntity, uriInfo))
            : null;
    this.parent = desc.parent();
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

    String logicalEntityId = resolveLogicalEntityId(diagramNode);
    if (logicalEntityId != null) {
      model.add(
          Link.of(
                  ApiTemplates.logicalEntity(uriInfo)
                      .build(project.getIdentity(), logicalEntityId)
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

  private static String resolveLogicalEntityId(DiagramNode diagramNode) {
    NodeDescription description = diagramNode.getDescription();
    if (description != null && description.logicalEntity() != null) {
      String idFromDescription = description.logicalEntity().id();
      if (hasText(idFromDescription)) {
        return idFromDescription;
      }
    }

    LogicalEntity logicalEntity = diagramNode.logicalEntity();
    if (logicalEntity != null && hasText(logicalEntity.getIdentity())) {
      return logicalEntity.getIdentity();
    }

    return null;
  }

  private static boolean hasText(String value) {
    return value != null && !value.isBlank();
  }
}
