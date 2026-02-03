package reengineering.ddd.teamai.api;

import jakarta.ws.rs.Path;
import jakarta.ws.rs.PathParam;
import jakarta.ws.rs.container.ResourceContext;
import jakarta.ws.rs.core.Context;
import reengineering.ddd.teamai.model.Projects;

public class GlobalProjectsApi {

  private final Projects projects;

  @Context private ResourceContext resourceContext;

  public GlobalProjectsApi(Projects projects) {
    this.projects = projects;
  }

  @Path("{id}")
  public GlobalProjectApi findById(@PathParam("id") String id) {
    return projects
        .findByIdentity(id)
        .map(
            (project) -> {
              GlobalProjectApi projectApi = new GlobalProjectApi(project);
              return resourceContext.initResource(projectApi);
            })
        .orElse(null);
  }
}
