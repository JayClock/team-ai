package reengineering.ddd.teamai.api;

import jakarta.ws.rs.GET;
import jakarta.ws.rs.POST;
import jakarta.ws.rs.Path;
import jakarta.ws.rs.PathParam;
import jakarta.ws.rs.WebApplicationException;
import jakarta.ws.rs.container.ResourceContext;
import jakarta.ws.rs.core.Context;
import jakarta.ws.rs.core.Response;
import jakarta.ws.rs.core.UriInfo;
import org.springframework.hateoas.CollectionModel;
import org.springframework.hateoas.Link;
import reengineering.ddd.teamai.api.representation.DiagramVersionModel;
import reengineering.ddd.teamai.model.Diagram;
import reengineering.ddd.teamai.model.DiagramVersion;
import reengineering.ddd.teamai.model.Project;

public class DiagramVersionsApi {
  @Context ResourceContext resourceContext;

  private final Project project;
  private final Diagram diagram;

  public DiagramVersionsApi(Project project, Diagram diagram) {
    this.project = project;
    this.diagram = diagram;
  }

  @Path("{version-id}")
  public DiagramVersionApi findById(@PathParam("version-id") String id) {
    return diagram
        .versions()
        .findByIdentity(id)
        .map(
            version -> {
              DiagramVersionApi api = new DiagramVersionApi(project, diagram, version);
              return resourceContext.initResource(api);
            })
        .orElseThrow(() -> new WebApplicationException(Response.Status.NOT_FOUND));
  }

  @GET
  public CollectionModel<DiagramVersionModel> findAll(@Context UriInfo uriInfo) {
    return CollectionModel.of(
        diagram.versions().findAll().stream()
            .map(version -> DiagramVersionModel.simple(project, diagram, version, uriInfo))
            .toList(),
        Link.of(
            ApiTemplates.versions(uriInfo)
                .build(project.getIdentity(), diagram.getIdentity())
                .toString()));
  }

  @POST
  public Response create(@Context UriInfo uriInfo) {
    DiagramVersion created = diagram.createVersion();
    DiagramVersionModel model = DiagramVersionModel.of(project, diagram, created, uriInfo);
    return Response.created(
            ApiTemplates.version(uriInfo)
                .build(project.getIdentity(), diagram.getIdentity(), created.getIdentity()))
        .entity(model)
        .build();
  }
}
