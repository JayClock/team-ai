package reengineering.ddd.teamai.api;

import jakarta.ws.rs.DefaultValue;
import jakarta.ws.rs.GET;
import jakarta.ws.rs.Path;
import jakarta.ws.rs.PathParam;
import jakarta.ws.rs.QueryParam;
import jakarta.ws.rs.WebApplicationException;
import jakarta.ws.rs.container.ResourceContext;
import jakarta.ws.rs.core.Context;
import jakarta.ws.rs.core.Response;
import jakarta.ws.rs.core.UriInfo;
import org.springframework.hateoas.CollectionModel;
import reengineering.ddd.teamai.api.representation.AcpSessionModel;
import reengineering.ddd.teamai.model.Project;

public class SessionsApi {
  @Context ResourceContext resourceContext;

  private final Project project;

  public SessionsApi(Project project) {
    this.project = project;
  }

  @Path("{session-id}")
  public SessionApi findById(@PathParam("session-id") String id) {
    return project
        .acpSessions()
        .findByIdentity(id)
        .map(
            session -> {
              SessionApi api = new SessionApi(project, session);
              return resourceContext.initResource(api);
            })
        .orElseThrow(() -> new WebApplicationException(Response.Status.NOT_FOUND));
  }

  @GET
  @VendorMediaType(ResourceTypes.SESSION_COLLECTION)
  public CollectionModel<AcpSessionModel> findAll(
      @Context UriInfo uriInfo, @DefaultValue("0") @QueryParam("page") int page) {
    return new Pagination<>(project.acpSessions().findAll(), 40)
        .page(
            page,
            session -> AcpSessionModel.simple(project, session, uriInfo),
            p -> ApiTemplates.sessions(uriInfo).queryParam("page", p).build(project.getIdentity()));
  }
}
