package reengineering.ddd.teamai.api;

import jakarta.validation.Valid;
import jakarta.validation.constraints.NotNull;
import jakarta.ws.rs.Consumes;
import jakarta.ws.rs.GET;
import jakarta.ws.rs.POST;
import jakarta.ws.rs.Path;
import jakarta.ws.rs.core.Context;
import jakarta.ws.rs.core.MediaType;
import jakarta.ws.rs.core.UriInfo;
import java.util.Optional;
import lombok.Data;
import lombok.NoArgsConstructor;
import reengineering.ddd.archtype.Ref;
import reengineering.ddd.teamai.api.representation.AgentModel;
import reengineering.ddd.teamai.description.AgentDescription;
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

  @POST
  @Path("status")
  @Consumes(MediaType.APPLICATION_JSON)
  @VendorMediaType(ResourceTypes.AGENT)
  public AgentModel updateStatus(
      @Valid UpdateAgentStatusRequest request, @Context UriInfo uriInfo) {
    project.updateAgentStatus(new Ref<>(agent.getIdentity()), request.getStatus());
    Optional<Agent> reloaded = project.agents().findByIdentity(agent.getIdentity());
    return AgentModel.of(project, reloaded.orElse(agent), uriInfo);
  }

  @Data
  @NoArgsConstructor
  public static class UpdateAgentStatusRequest {
    @NotNull private AgentDescription.Status status;
  }
}
