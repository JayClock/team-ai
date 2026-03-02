package reengineering.ddd.teamai.api;

import jakarta.ws.rs.GET;
import jakarta.ws.rs.core.Context;
import jakarta.ws.rs.core.UriInfo;
import reengineering.ddd.teamai.api.representation.AgentModel;
import reengineering.ddd.teamai.model.Agent;
import reengineering.ddd.teamai.model.Project;

public class AgentApi {
  private final Project project;
  private final Agent agent;

  public AgentApi(Project project, Agent agent) {
    this.project = project;
    this.agent = agent;
  }

  @GET
  @VendorMediaType(ResourceTypes.AGENT)
  public AgentModel get(@Context UriInfo uriInfo) {
    return AgentModel.of(project, agent, uriInfo);
  }
}
