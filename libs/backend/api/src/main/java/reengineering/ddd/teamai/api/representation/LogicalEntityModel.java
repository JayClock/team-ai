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
import reengineering.ddd.teamai.description.LogicalEntityDescription;
import reengineering.ddd.teamai.model.LogicalEntity;
import reengineering.ddd.teamai.model.Project;

@Relation(collectionRelation = "logical-entities")
public class LogicalEntityModel extends RepresentationModel<LogicalEntityModel> {
  @JsonProperty private String id;

  @JsonUnwrapped private LogicalEntityDescription description;

  public LogicalEntityModel(Project project, LogicalEntity entity, UriInfo uriInfo) {
    this.id = entity.getIdentity();
    this.description = entity.getDescription();
  }

  public static LogicalEntityModel of(Project project, LogicalEntity entity, UriInfo uriInfo) {
    LogicalEntityModel model = new LogicalEntityModel(project, entity, uriInfo);
    model.add(
        Affordances.of(
                Link.of(
                        ApiTemplates.logicalEntity(uriInfo)
                            .build(project.getIdentity(), entity.getIdentity())
                            .getPath())
                    .withSelfRel())
            .afford(HttpMethod.PUT)
            .withInput(LogicalEntityDescription.class)
            .andAfford(HttpMethod.DELETE)
            .withName("delete-logical-entity")
            .toLink());

    model.add(
        Link.of(ApiTemplates.logicalEntities(uriInfo).build(project.getIdentity()).getPath())
            .withRel("logical-entities"));
    return model;
  }

  public static LogicalEntityModel simple(Project project, LogicalEntity entity, UriInfo uriInfo) {
    LogicalEntityModel model = new LogicalEntityModel(project, entity, uriInfo);
    model.add(
        Link.of(
                ApiTemplates.logicalEntity(uriInfo)
                    .build(project.getIdentity(), entity.getIdentity())
                    .getPath())
            .withSelfRel());
    return model;
  }
}
