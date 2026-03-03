package reengineering.ddd.teamai.api;

import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.ws.rs.BadRequestException;
import jakarta.ws.rs.Consumes;
import jakarta.ws.rs.DELETE;
import jakarta.ws.rs.GET;
import jakarta.ws.rs.POST;
import jakarta.ws.rs.PUT;
import jakarta.ws.rs.Path;
import jakarta.ws.rs.core.Context;
import jakarta.ws.rs.core.MediaType;
import jakarta.ws.rs.core.Response;
import jakarta.ws.rs.core.UriInfo;
import java.util.Locale;
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

  @PUT
  @Path("config")
  @Consumes(MediaType.APPLICATION_JSON)
  @VendorMediaType(ResourceTypes.AGENT)
  public AgentModel updateConfig(
      @Valid UpdateAgentConfigRequest request, @Context UriInfo uriInfo) {
    String prompt = normalizePrompt(request.getPrompt());
    if (request.getRole() == AgentDescription.Role.SPECIALIST && prompt == null) {
      throw new BadRequestException("specialist prompt must not be blank");
    }
    project.updateAgent(
        agent.getIdentity(),
        new AgentDescription(
            request.getName(),
            request.getRole(),
            request.getModelTier().trim().toUpperCase(Locale.ROOT),
            request.getStatus(),
            toRef(request.getParentId()),
            prompt));
    Optional<Agent> reloaded = project.agents().findByIdentity(agent.getIdentity());
    return AgentModel.of(project, reloaded.orElse(agent), uriInfo);
  }

  @DELETE
  @VendorMediaType(ResourceTypes.AGENT)
  public Response delete() {
    project.deleteAgent(agent.getIdentity());
    return Response.noContent().build();
  }

  private Ref<String> toRef(String id) {
    if (id == null || id.isBlank()) {
      return null;
    }
    return new Ref<>(id);
  }

  private String normalizePrompt(String prompt) {
    if (prompt == null) {
      return null;
    }
    String normalized = prompt.trim();
    return normalized.isEmpty() ? null : normalized;
  }

  @Data
  @NoArgsConstructor
  public static class UpdateAgentStatusRequest {
    @NotNull private AgentDescription.Status status;
  }

  @Data
  @NoArgsConstructor
  public static class UpdateAgentConfigRequest {
    @NotBlank private String name;
    @NotNull private AgentDescription.Role role;
    @NotBlank private String modelTier;
    @NotNull private AgentDescription.Status status;

    private String parentId;
    private String prompt;
  }
}
