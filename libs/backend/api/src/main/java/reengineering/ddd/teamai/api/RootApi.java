package reengineering.ddd.teamai.api;

import jakarta.inject.Inject;
import jakarta.ws.rs.GET;
import jakarta.ws.rs.Path;
import jakarta.ws.rs.Produces;
import jakarta.ws.rs.container.ResourceContext;
import jakarta.ws.rs.core.Context;
import jakarta.ws.rs.core.MediaType;
import jakarta.ws.rs.core.SecurityContext;
import jakarta.ws.rs.core.UriInfo;
import java.security.Principal;
import org.springframework.stereotype.Component;
import reengineering.ddd.teamai.api.representation.RootModel;
import reengineering.ddd.teamai.model.Projects;
import reengineering.ddd.teamai.model.Users;

@Component
@Path("/")
public class RootApi {
  @Inject Users users;
  @Inject Projects projects;

  @Context private ResourceContext resourceContext;

  @GET
  @Produces(MediaType.APPLICATION_JSON)
  public RootModel get(@Context SecurityContext securityContext, @Context UriInfo uriInfo) {
    Principal principal = securityContext.getUserPrincipal();

    if (principal == null) {
      return RootModel.anonymous(uriInfo);
    } else {
      String userId = principal.getName();
      return RootModel.authenticated(userId, uriInfo);
    }
  }

  @Path("users")
  public UsersApi users() {
    UsersApi usersApi = new UsersApi(users);
    return resourceContext.initResource(usersApi);
  }

  @Path("projects")
  public ProjectsApi globalProjects() {
    ProjectsApi globalProjectsApi = new ProjectsApi(projects);
    return resourceContext.initResource(globalProjectsApi);
  }
}
