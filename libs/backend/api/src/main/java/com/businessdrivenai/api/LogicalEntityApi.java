package com.businessdrivenai.api;

import com.businessdrivenai.api.representation.LogicalEntityModel;
import com.businessdrivenai.domain.model.LogicalEntity;
import com.businessdrivenai.domain.model.Project;
import jakarta.ws.rs.GET;
import jakarta.ws.rs.container.ResourceContext;
import jakarta.ws.rs.core.Context;
import jakarta.ws.rs.core.UriInfo;

public class LogicalEntityApi {
  @Context ResourceContext resourceContext;

  private final Project project;
  private final LogicalEntity entity;

  public LogicalEntityApi(Project project, LogicalEntity entity) {
    this.project = project;
    this.entity = entity;
  }

  @GET
  @VendorMediaType(ResourceTypes.LOGICAL_ENTITY)
  public LogicalEntityModel get(@Context UriInfo uriInfo) {
    return LogicalEntityModel.of(project, entity, uriInfo);
  }
}
