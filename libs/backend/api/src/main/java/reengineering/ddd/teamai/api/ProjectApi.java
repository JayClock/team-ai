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
import reengineering.ddd.teamai.model.User;

public class ProjectApi {
  @Context ResourceContext resourceContext;

  private final User user;
  private final Project project;

  public ProjectApi(User user, Project project) {
    this.user = user;
    this.project = project;
  }

  @GET
  @VendorMediaType(ResourceTypes.PROJECT)
  public ProjectModel find(@Context UriInfo uriInfo) {
    return ProjectModel.of(user, project, uriInfo);
  }

  @DELETE
  public Response delete() {
    user.deleteProject(project.getIdentity());
    return Response.noContent().build();
  }

  @Path("conversations")
  public ConversationsApi conversations() {
    return resourceContext.initResource(new ConversationsApi(user, project));
  }
}
