package reengineering.ddd.teamai.api;

import jakarta.ws.rs.Consumes;
import jakarta.ws.rs.DefaultValue;
import jakarta.ws.rs.GET;
import jakarta.ws.rs.POST;
import jakarta.ws.rs.Path;
import jakarta.ws.rs.PathParam;
import jakarta.ws.rs.QueryParam;
import jakarta.ws.rs.WebApplicationException;
import jakarta.ws.rs.container.ResourceContext;
import jakarta.ws.rs.core.Context;
import jakarta.ws.rs.core.MediaType;
import jakarta.ws.rs.core.Response;
import jakarta.ws.rs.core.UriInfo;
import org.springframework.hateoas.CollectionModel;
import reengineering.ddd.teamai.api.representation.ProjectModel;
import reengineering.ddd.teamai.description.ProjectDescription;
import reengineering.ddd.teamai.model.Project;
import reengineering.ddd.teamai.model.User;

public class ProjectsApi {
  @Context ResourceContext resourceContext;

  private final User user;

  public ProjectsApi(User user) {
    this.user = user;
  }

  @Path("{project-id}")
  public ProjectApi findById(@PathParam("project-id") String id) {
    return user.projects().findAll().stream()
        .filter(project -> project.getIdentity().equals(id))
        .findFirst()
        .map(
            project -> {
              ProjectApi projectApi = new ProjectApi(user, project);
              return resourceContext.initResource(projectApi);
            })
        .orElseThrow(() -> new WebApplicationException(Response.Status.NOT_FOUND));
  }

  @GET
  public CollectionModel<ProjectModel> findAll(
      @Context UriInfo uriInfo, @DefaultValue("0") @QueryParam("page") int page) {
    return new Pagination<>(user.projects().findAll(), 40)
        .page(
            page,
            project -> ProjectModel.simple(user, project, uriInfo),
            p -> ApiTemplates.projects(uriInfo).queryParam("page", p).build(user.getIdentity()));
  }

  @POST
  @Consumes(MediaType.APPLICATION_JSON)
  public Response create(Project.ProjectChange requestBody, @Context UriInfo uriInfo) {
    ProjectDescription description =
        new ProjectDescription(requestBody.getName(), requestBody.getDomainModel());
    Project project = user.add(description);
    ProjectModel projectModel = ProjectModel.of(user, project, uriInfo);
    return Response.created(
            ApiTemplates.project(uriInfo).build(user.getIdentity(), project.getIdentity()))
        .entity(projectModel)
        .build();
  }
}
