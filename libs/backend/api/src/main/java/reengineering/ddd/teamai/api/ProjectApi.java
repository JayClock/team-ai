package reengineering.ddd.teamai.api;

import jakarta.ws.rs.DELETE;
import jakarta.ws.rs.GET;
import jakarta.ws.rs.Path;
import jakarta.ws.rs.container.ResourceContext;
import jakarta.ws.rs.core.Context;
import jakarta.ws.rs.core.Response;
import jakarta.ws.rs.core.UriInfo;
import reengineering.ddd.teamai.api.representation.ProjectModel;
import reengineering.ddd.teamai.model.Project;

public class ProjectApi {
  @Context ResourceContext resourceContext;

  private final Project project;

  public ProjectApi(Project project) {
    this.project = project;
  }

  @GET
  @VendorMediaType(ResourceTypes.PROJECT)
  public ProjectModel find(@Context UriInfo uriInfo) {
    return ProjectModel.global(project, uriInfo);
  }

  @DELETE
  public Response delete() {
    return Response.noContent().build();
  }

  @Path("conversations")
  public ConversationsApi conversations() {
    return resourceContext.initResource(new ConversationsApi(project));
  }
}
