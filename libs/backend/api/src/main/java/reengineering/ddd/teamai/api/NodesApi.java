package reengineering.ddd.teamai.api;

import jakarta.validation.Valid;
import jakarta.ws.rs.*;
import jakarta.ws.rs.container.ResourceContext;
import jakarta.ws.rs.core.Context;
import jakarta.ws.rs.core.MediaType;
import jakarta.ws.rs.core.Response;
import jakarta.ws.rs.core.UriInfo;
import org.springframework.hateoas.CollectionModel;
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
  public CollectionModel<DiagramNodeModel> findAll(
      @Context UriInfo uriInfo, @DefaultValue("0") @QueryParam("page") int page) {
    return new Pagination<>(diagram.nodes().findAll(), 20)
        .page(
            page,
            node -> DiagramNodeModel.simple(project, diagram, node, uriInfo),
            p ->
                ApiTemplates.nodes(uriInfo)
                    .queryParam("page", p)
                    .build(project.getIdentity(), diagram.getIdentity()));
  }

  @POST
  @Consumes(MediaType.APPLICATION_JSON)
  public Response create(@Valid NodeDescription change, @Context UriInfo uriInfo) {
    DiagramNode created = diagram.addNode(change);
    DiagramNodeModel model = new DiagramNodeModel(project, diagram, created, uriInfo);
    return Response.created(
            ApiTemplates.node(uriInfo)
                .build(project.getIdentity(), diagram.getIdentity(), created.getIdentity()))
        .entity(model)
        .build();
  }
}
