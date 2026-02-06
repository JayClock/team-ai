package reengineering.ddd.teamai.api;

import jakarta.validation.Valid;
import jakarta.validation.constraints.NotNull;
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
import lombok.Data;
import lombok.NoArgsConstructor;
import org.springframework.hateoas.CollectionModel;
import reengineering.ddd.teamai.api.representation.DiagramModel;
import reengineering.ddd.teamai.description.DiagramDescription;
import reengineering.ddd.teamai.model.Diagram;
import reengineering.ddd.teamai.model.Project;

public class DiagramsApi {
  @Context ResourceContext resourceContext;

  private final Project project;

  public DiagramsApi(Project project) {
    this.project = project;
  }

  @Path("{id}")
  public DiagramApi findById(@PathParam("id") String id) {
    return project
        .diagrams()
        .findByIdentity(id)
        .map(
            entity -> {
              DiagramApi api = new DiagramApi(project, entity);
              return resourceContext.initResource(api);
            })
        .orElseThrow(() -> new WebApplicationException(Response.Status.NOT_FOUND));
  }

  @GET
  public CollectionModel<DiagramModel> findAll(
      @Context UriInfo uriInfo, @DefaultValue("0") @QueryParam("page") int page) {
    return new Pagination<>(project.diagrams().findAll(), 20)
        .page(
            page,
            diagram -> DiagramModel.simple(project, diagram, uriInfo),
            p -> ApiTemplates.diagrams(uriInfo).queryParam("page", p).build(project.getIdentity()));
  }

  @POST
  @Consumes(MediaType.APPLICATION_JSON)
  public Response create(@Valid DiagramDescription change, @Context UriInfo uriInfo) {
    Diagram created = project.addDiagram(change);
    DiagramModel model = DiagramModel.of(project, created, uriInfo);
    return Response.created(
            ApiTemplates.diagram(uriInfo).build(project.getIdentity(), created.getIdentity()))
        .entity(model)
        .build();
  }

  @Data
  @NoArgsConstructor
  public static class CreateDiagramRequest {
    @NotNull private String title;
  }
}
