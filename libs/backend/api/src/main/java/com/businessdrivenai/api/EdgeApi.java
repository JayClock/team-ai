package com.businessdrivenai.api;

import com.businessdrivenai.api.representation.DiagramEdgeModel;
import com.businessdrivenai.domain.model.Diagram;
import com.businessdrivenai.domain.model.DiagramEdge;
import com.businessdrivenai.domain.model.Project;
import jakarta.ws.rs.GET;
import jakarta.ws.rs.container.ResourceContext;
import jakarta.ws.rs.core.Context;
import jakarta.ws.rs.core.UriInfo;

public class EdgeApi {
  @Context ResourceContext resourceContext;

  private final Project project;
  private final Diagram diagram;
  private final DiagramEdge entity;

  public EdgeApi(Project project, Diagram diagram, DiagramEdge entity) {
    this.project = project;
    this.diagram = diagram;
    this.entity = entity;
  }

  @GET
  @VendorMediaType(ResourceTypes.EDGE)
  public DiagramEdgeModel get(@Context UriInfo uriInfo) {
    return new DiagramEdgeModel(project, diagram, entity, uriInfo);
  }
}
