package com.businessdrivenai.api;

import com.businessdrivenai.domain.model.Projects;
import jakarta.ws.rs.Path;
import jakarta.ws.rs.PathParam;
import jakarta.ws.rs.WebApplicationException;
import jakarta.ws.rs.container.ResourceContext;
import jakarta.ws.rs.core.Context;
import jakarta.ws.rs.core.Response;

public class ProjectsApi {

  private final Projects projects;

  @Context private ResourceContext resourceContext;

  public ProjectsApi(Projects projects) {
    this.projects = projects;
  }

  @Path("{projectId}")
  public ProjectApi findById(@PathParam("projectId") String id) {
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
