package reengineering.ddd.teamai.api;

import jakarta.ws.rs.GET;
import jakarta.ws.rs.container.ResourceContext;
import jakarta.ws.rs.core.Context;
import jakarta.ws.rs.core.UriInfo;
import reengineering.ddd.teamai.api.representation.LogicalEntityModel;
import reengineering.ddd.teamai.model.LogicalEntity;
import reengineering.ddd.teamai.model.Project;

public class LogicalEntityApi {
  @Context ResourceContext resourceContext;

  private final Project project;
  private final LogicalEntity entity;

  public LogicalEntityApi(Project project, LogicalEntity entity) {
    this.project = project;
    this.entity = entity;
  }

  @GET
  @VendorMediaType(ResourceTypes.LOGICAL_ENTITY)
  public LogicalEntityModel get(@Context UriInfo uriInfo) {
    return new LogicalEntityModel(project, entity, uriInfo);
  }
}
