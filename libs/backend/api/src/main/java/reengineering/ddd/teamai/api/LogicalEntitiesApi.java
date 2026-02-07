package reengineering.ddd.teamai.api;

import jakarta.validation.Valid;
import jakarta.validation.constraints.NotNull;
import jakarta.ws.rs.Consumes;
import jakarta.ws.rs.POST;
import jakarta.ws.rs.Path;
import jakarta.ws.rs.PathParam;
import jakarta.ws.rs.WebApplicationException;
import jakarta.ws.rs.container.ResourceContext;
import jakarta.ws.rs.core.Context;
import jakarta.ws.rs.core.MediaType;
import jakarta.ws.rs.core.Response;
import jakarta.ws.rs.core.UriInfo;
import lombok.Data;
import lombok.NoArgsConstructor;
import reengineering.ddd.archtype.Ref;
import reengineering.ddd.teamai.api.representation.LogicalEntityModel;
import reengineering.ddd.teamai.description.LogicalEntityDescription;
import reengineering.ddd.teamai.description.SubType;
import reengineering.ddd.teamai.model.LogicalEntity;
import reengineering.ddd.teamai.model.Project;

public class LogicalEntitiesApi {
  private final Project project;
  @Context private ResourceContext resourceContext;

  public LogicalEntitiesApi(Project project) {
    this.project = project;
  }

  @Path("{id}")
  public LogicalEntityApi findById(@PathParam("id") String id) {
    return project
        .logicalEntities()
        .findByIdentity(id)
        .map(
            entity -> {
              LogicalEntityApi api = new LogicalEntityApi(project, entity);
              return resourceContext.initResource(api);
            })
        .orElseThrow(() -> new WebApplicationException(Response.Status.NOT_FOUND));
  }

  @POST
  @Consumes(MediaType.APPLICATION_JSON)
  public Response create(@Valid CreateLogicalEntityRequest request, @Context UriInfo uriInfo) {
    LogicalEntity created =
        project.addLogicalEntity(
            new LogicalEntityDescription(
                request.getType(),
                request.getSubType(),
                request.getName(),
                request.getLabel(),
                null,
                null,
                new Ref<>(project.getIdentity())));

    return Response.status(Response.Status.CREATED)
        .entity(new LogicalEntityModel(project, created, uriInfo))
        .build();
  }

  @Data
  @NoArgsConstructor
  public static class CreateLogicalEntityRequest {
    @NotNull private LogicalEntityDescription.Type type;

    private SubType subType;

    @NotNull private String name;

    private String label;
  }
}
