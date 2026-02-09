package com.businessdrivenai.domain.model;

import com.businessdrivenai.archtype.Entity;
import com.businessdrivenai.archtype.HasOne;
import com.businessdrivenai.domain.description.NodeDescription;

public class DiagramNode implements Entity<String, NodeDescription> {
  private String identity;
  private NodeDescription description;
  private HasOne<LogicalEntity> logicalEntity;

  public DiagramNode(
      String identity, NodeDescription description, HasOne<LogicalEntity> logicalEntity) {
    this.identity = identity;
    this.description = description;
    this.logicalEntity = logicalEntity;
  }

  public DiagramNode() {}

  @Override
  public String getIdentity() {
    return identity;
  }

  @Override
  public NodeDescription getDescription() {
    return description;
  }

  public LogicalEntity logicalEntity() {
    return this.logicalEntity.get();
  }

  public void setLogicalEntity(HasOne<LogicalEntity> logicalEntity) {
    this.logicalEntity = logicalEntity;
  }
}
