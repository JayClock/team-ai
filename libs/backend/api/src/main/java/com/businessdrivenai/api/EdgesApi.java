package com.businessdrivenai.api;

import com.businessdrivenai.api.representation.DiagramEdgeModel;
import com.businessdrivenai.archtype.Ref;
import com.businessdrivenai.domain.description.EdgeDescription;
import com.businessdrivenai.domain.model.Diagram;
import com.businessdrivenai.domain.model.DiagramEdge;
import com.businessdrivenai.domain.model.Project;
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

public class EdgesApi {
  @Context ResourceContext resourceContext;

  private final Project project;
  private final Diagram diagram;

  public EdgesApi(Project project, Diagram diagram) {
    this.project = project;
    this.diagram = diagram;
  }

  @Path("{edge-id}")
  public EdgeApi findById(@PathParam("edge-id") String id) {
    return diagram
        .edges()
        .findByIdentity(id)
        .map(
            entity -> {
              EdgeApi api = new EdgeApi(project, diagram, entity);
              return resourceContext.initResource(api);
            })
        .orElseThrow(() -> new WebApplicationException(Response.Status.NOT_FOUND));
  }

  @GET
  public CollectionModel<DiagramEdgeModel> findAll(@Context UriInfo uriInfo) {
    return CollectionModel.of(
        diagram.edges().findAll().stream()
            .map(edge -> DiagramEdgeModel.simple(project, diagram, edge, uriInfo))
            .toList(),
        Link.of(
            ApiTemplates.edges(uriInfo)
                .build(project.getIdentity(), diagram.getIdentity())
                .toString()));
  }

  @POST
  @Consumes(MediaType.APPLICATION_JSON)
  public Response create(@Valid CreateEdgeRequest request, @Context UriInfo uriInfo) {
    EdgeDescription description =
        new EdgeDescription(
            new Ref<>(request.sourceNodeId),
            new Ref<>(request.targetNodeId),
            null,
            null,
            null,
            null,
            null);
    DiagramEdge created = diagram.addEdge(description);
    DiagramEdgeModel model = new DiagramEdgeModel(project, diagram, created, uriInfo);
    return Response.created(
            ApiTemplates.edge(uriInfo)
                .build(project.getIdentity(), diagram.getIdentity(), created.getIdentity()))
        .entity(model)
        .build();
  }

  @Data
  @NoArgsConstructor
  public static class CreateEdgeRequest {
    @NotNull private String sourceNodeId;

    @NotNull private String targetNodeId;
  }
}
