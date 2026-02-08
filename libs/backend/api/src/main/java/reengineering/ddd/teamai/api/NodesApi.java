package reengineering.ddd.teamai.api;

import jakarta.validation.Valid;
import jakarta.validation.constraints.NotNull;
import jakarta.ws.rs.Consumes;
import jakarta.ws.rs.GET;
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
import org.springframework.hateoas.CollectionModel;
import org.springframework.hateoas.Link;
import reengineering.ddd.archtype.Ref;
import reengineering.ddd.teamai.api.representation.DiagramNodeModel;
import reengineering.ddd.teamai.description.NodeDescription;
import reengineering.ddd.teamai.model.Diagram;
import reengineering.ddd.teamai.model.DiagramNode;
import reengineering.ddd.teamai.model.Project;

public class NodesApi {
  @Context ResourceContext resourceContext;

  private final Project project;
  private final Diagram diagram;

  public NodesApi(Project project, Diagram diagram) {
    this.project = project;
    this.diagram = diagram;
  }

  @Path("{node-id}")
  public NodeApi findById(@PathParam("node-id") String id) {
    return diagram
        .nodes()
        .findByIdentity(id)
        .map(
            entity -> {
              NodeApi api = new NodeApi(project, diagram, entity);
              return resourceContext.initResource(api);
            })
        .orElseThrow(() -> new WebApplicationException(Response.Status.NOT_FOUND));
  }

  @GET
  public CollectionModel<DiagramNodeModel> findAll(@Context UriInfo uriInfo) {
    return CollectionModel.of(
        diagram.nodes().findAll().stream()
            .map(node -> DiagramNodeModel.simple(project, diagram, node, uriInfo))
            .toList(),
        Link.of(
            ApiTemplates.nodes(uriInfo)
                .build(project.getIdentity(), diagram.getIdentity())
                .toString()));
  }

  @POST
  @Consumes(MediaType.APPLICATION_JSON)
  public Response create(@Valid CreateNodeRequest request, @Context UriInfo uriInfo) {
    NodeDescription description =
        new NodeDescription(
            request.type,
            new Ref<>(request.logicalEntityId),
            new Ref<>(request.parentId),
            request.positionX,
            request.positionY,
            request.width,
            request.height,
            null,
            null);
    DiagramNode created = diagram.addNode(description);
    DiagramNodeModel model = new DiagramNodeModel(project, diagram, created, uriInfo);
    return Response.created(
            ApiTemplates.node(uriInfo)
                .build(project.getIdentity(), diagram.getIdentity(), created.getIdentity()))
        .entity(model)
        .build();
  }

  @Data
  @NoArgsConstructor
  public static class CreateNodeRequest {
    @NotNull private String type;

    private String logicalEntityId;
    private String parentId;
    private double positionX;
    private double positionY;

    @NotNull private Integer width;

    @NotNull private Integer height;
  }
}
