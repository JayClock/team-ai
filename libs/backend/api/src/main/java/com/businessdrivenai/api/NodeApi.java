package com.businessdrivenai.api;

import com.businessdrivenai.api.representation.DiagramNodeModel;
import com.businessdrivenai.domain.model.Diagram;
import com.businessdrivenai.domain.model.DiagramNode;
import com.businessdrivenai.domain.model.Project;
import jakarta.ws.rs.GET;
import jakarta.ws.rs.container.ResourceContext;
import jakarta.ws.rs.core.Context;
import jakarta.ws.rs.core.UriInfo;

public class NodeApi {
  @Context ResourceContext resourceContext;

  private final Project project;
  private final Diagram diagram;
  private final DiagramNode entity;

  public NodeApi(Project project, Diagram diagram, DiagramNode entity) {
    this.project = project;
    this.diagram = diagram;
    this.entity = entity;
  }

  @GET
  @VendorMediaType(ResourceTypes.NODE)
  public DiagramNodeModel get(@Context UriInfo uriInfo) {
    return DiagramNodeModel.of(project, diagram, entity, uriInfo);
  }
}
