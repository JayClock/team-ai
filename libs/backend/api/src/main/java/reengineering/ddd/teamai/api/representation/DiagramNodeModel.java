package reengineering.ddd.teamai.api.representation;

import com.fasterxml.jackson.annotation.JsonProperty;
import jakarta.ws.rs.core.UriInfo;
import java.util.List;
import org.springframework.hateoas.Link;
import org.springframework.hateoas.RepresentationModel;
import org.springframework.hateoas.mediatype.Affordances;
import org.springframework.hateoas.server.core.Relation;
import org.springframework.http.HttpMethod;
import reengineering.ddd.teamai.api.ApiTemplates;
import reengineering.ddd.teamai.api.NodesApi;
import reengineering.ddd.teamai.description.LocalNodeData;
import reengineering.ddd.teamai.description.NodeDescription;
import reengineering.ddd.teamai.description.NodeStyleConfig;
import reengineering.ddd.teamai.model.Diagram;
import reengineering.ddd.teamai.model.DiagramNode;
import reengineering.ddd.teamai.model.Project;

@Relation(collectionRelation = "nodes")
public class DiagramNodeModel extends RepresentationModel<DiagramNodeModel> {
  @JsonProperty private String id;
  @JsonProperty private String type;
  @JsonProperty private String logicalEntityId;
  @JsonProperty private String parentId;
  @JsonProperty private double positionX;
  @JsonProperty private double positionY;
  @JsonProperty private Integer width;
  @JsonProperty private Integer height;
  @JsonProperty private StyleConfigModel styleConfig;
  @JsonProperty private LocalDataModel localData;

  private static class StyleConfigModel {
    private final String backgroundColor;
    private final String textColor;
    private final Integer fontSize;
    private final Boolean collapsed;
    private final List<String> hiddenAttributes;

    StyleConfigModel(NodeStyleConfig config) {
      if (config != null) {
        this.backgroundColor = config.backgroundColor();
        this.textColor = config.textColor();
        this.fontSize = config.fontSize();
        this.collapsed = config.collapsed();
        this.hiddenAttributes = config.hiddenAttributes();
      } else {
        this.backgroundColor = null;
        this.textColor = null;
        this.fontSize = null;
        this.collapsed = null;
        this.hiddenAttributes = null;
      }
    }

    public String getBackgroundColor() {
      return backgroundColor;
    }

    public String getTextColor() {
      return textColor;
    }

    public Integer getFontSize() {
      return fontSize;
    }

    public Boolean getCollapsed() {
      return collapsed;
    }

    public List<String> getHiddenAttributes() {
      return hiddenAttributes;
    }
  }

  private static class LocalDataModel {
    private final String content;
    private final String color;
    private final String type;

    LocalDataModel(LocalNodeData data) {
      if (data != null) {
        this.content = data.content();
        this.color = data.color();
        this.type = data.type();
      } else {
        this.content = null;
        this.color = null;
        this.type = null;
      }
    }

    public String getContent() {
      return content;
    }

    public String getColor() {
      return color;
    }

    public String getType() {
      return type;
    }
  }

  public DiagramNodeModel(
      Project project, Diagram diagram, DiagramNode diagramNode, UriInfo uriInfo) {
    NodeDescription desc = diagramNode.getDescription();
    this.id = diagramNode.getIdentity();
    this.type = desc.type();
    this.logicalEntityId = desc.logicalEntity() != null ? desc.logicalEntity().id() : null;
    this.parentId = desc.parent() != null ? desc.parent().id() : null;
    this.positionX = desc.positionX();
    this.positionY = desc.positionY();
    this.width = desc.width();
    this.height = desc.height();
    this.styleConfig = new StyleConfigModel(desc.styleConfig());
    this.localData = new LocalDataModel(desc.localData());
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
        Link.of(
                ApiTemplates.diagram(uriInfo)
                    .build(project.getIdentity(), diagram.getIdentity())
                    .getPath())
            .withRel("diagram"));

    model.add(
        Link.of(
                ApiTemplates.logicalEntity(uriInfo)
                    .build(project.getIdentity(), diagramNode.getDescription().logicalEntity().id())
                    .getPath())
            .withRel("logical-entity"));

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
