package reengineering.ddd.teamai.api;

import jakarta.ws.rs.Path;
import jakarta.ws.rs.PathParam;
import jakarta.ws.rs.WebApplicationException;
import jakarta.ws.rs.container.ResourceContext;
import jakarta.ws.rs.core.Context;
import jakarta.ws.rs.core.Response;
import reengineering.ddd.teamai.model.Projects;

public class ProjectsApi {

  private final Projects projects;

  @Context private ResourceContext resourceContext;

  public ProjectsApi(Projects projects) {
    this.projects = projects;
  }

  @Path("{id}")
  public ProjectApi findById(@PathParam("id") String id) {
    return projects
        .findByIdentity(id)
        .map(
            (project) -> {
              ProjectApi projectApi = new ProjectApi(project);
              return resourceContext.initResource(projectApi);
            })
        .orElseThrow(() -> new WebApplicationException(Response.Status.NOT_FOUND));
  }
}
