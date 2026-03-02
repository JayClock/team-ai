package reengineering.ddd.teamai.api;

import jakarta.ws.rs.GET;
import jakarta.ws.rs.core.Context;
import jakarta.ws.rs.core.UriInfo;
import reengineering.ddd.teamai.api.representation.AgentEventModel;
import reengineering.ddd.teamai.model.AgentEvent;
import reengineering.ddd.teamai.model.Project;

public class AgentEventApi {
  private final Project project;
  private final AgentEvent event;

  public AgentEventApi(Project project, AgentEvent event) {
    this.project = project;
    this.event = event;
  }

  @GET
  @VendorMediaType(ResourceTypes.AGENT_EVENT)
  public AgentEventModel get(@Context UriInfo uriInfo) {
    return AgentEventModel.of(project, event, uriInfo);
  }
}
