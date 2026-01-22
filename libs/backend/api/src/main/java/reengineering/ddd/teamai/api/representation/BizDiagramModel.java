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
import reengineering.ddd.teamai.description.BizDiagramDescription;
import reengineering.ddd.teamai.model.BizDiagram;
import reengineering.ddd.teamai.model.Project;
import reengineering.ddd.teamai.model.User;

@Relation(collectionRelation = "biz-diagrams")
public class BizDiagramModel extends RepresentationModel<BizDiagramModel> {
  @JsonProperty private String id;
  @JsonUnwrapped private BizDiagramDescription description;
  @JsonProperty private String projectId;
  @JsonProperty private String createdAt;
  @JsonProperty private String updatedAt;

  public BizDiagramModel(User user, Project project, BizDiagram diagram, UriInfo uriInfo) {
    this.id = diagram.getIdentity();
    this.description = diagram.getDescription();
    this.projectId = project.getIdentity();

    add(
        Affordances.of(
                Link.of(
                        ApiTemplates.bizDiagram(uriInfo)
                            .build(user.getIdentity(), project.getIdentity(), diagram.getIdentity())
                            .getPath())
                    .withSelfRel())
            .afford(HttpMethod.PUT)
            .withInput(BizDiagram.BizDiagramChange.class)
            .andAfford(HttpMethod.DELETE)
            .withName("delete-diagram")
            .toLink());

    add(
        Link.of(
                ApiTemplates.project(uriInfo)
                    .build(user.getIdentity(), project.getIdentity())
                    .getPath())
            .withRel("project"));
  }
}
