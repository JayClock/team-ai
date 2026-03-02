package reengineering.ddd.teamai.api;

import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.ws.rs.Consumes;
import jakarta.ws.rs.DefaultValue;
import jakarta.ws.rs.GET;
import jakarta.ws.rs.POST;
import jakarta.ws.rs.Path;
import jakarta.ws.rs.PathParam;
import jakarta.ws.rs.QueryParam;
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
import org.springframework.hateoas.mediatype.Affordances;
import org.springframework.http.HttpMethod;
import reengineering.ddd.archtype.Ref;
import reengineering.ddd.teamai.api.representation.AgentModel;
import reengineering.ddd.teamai.description.AgentDescription;
import reengineering.ddd.teamai.model.Agent;
import reengineering.ddd.teamai.model.Project;

public class AgentsApi {
  @Context ResourceContext resourceContext;

  private final Project project;

  public AgentsApi(Project project) {
    this.project = project;
  }

  @Path("{agent-id}")
  public AgentApi findById(@PathParam("agent-id") String id) {
    return project
        .agents()
        .findByIdentity(id)
        .map(
            agent -> {
              AgentApi api = new AgentApi(project, agent);
              return resourceContext.initResource(api);
            })
        .orElseThrow(() -> new WebApplicationException(Response.Status.NOT_FOUND));
  }

  @GET
  @VendorMediaType(ResourceTypes.AGENT_COLLECTION)
  public CollectionModel<AgentModel> findAll(
      @Context UriInfo uriInfo, @DefaultValue("0") @QueryParam("page") int page) {
    CollectionModel<AgentModel> model =
        new Pagination<>(project.agents().findAll(), 40)
            .page(
                page,
                agent -> AgentModel.simple(project, agent, uriInfo),
                p ->
                    ApiTemplates.agents(uriInfo)
                        .queryParam("page", p)
                        .build(project.getIdentity()));

    model.add(
        Affordances.of(
                Link.of(ApiTemplates.agents(uriInfo).build(project.getIdentity()).getPath())
                    .withRel("create-agent"))
            .afford(HttpMethod.POST)
            .withInput(CreateAgentRequest.class)
            .andAfford(HttpMethod.POST)
            .withInput(CreateAgentRequest.class)
            .withName("create-agent")
            .toLink());

    return model;
  }

  @POST
  @Consumes(MediaType.APPLICATION_JSON)
  public Response create(@Valid CreateAgentRequest request, @Context UriInfo uriInfo) {
    AgentDescription description =
        new AgentDescription(
            request.getName(),
            request.getRole(),
            request.getModelTier() == null || request.getModelTier().isBlank()
                ? "SMART"
                : request.getModelTier(),
            request.getStatus() == null ? AgentDescription.Status.PENDING : request.getStatus(),
            toRef(request.getParentId()));

    Agent created = project.createAgent(description);
    return Response.created(
            ApiTemplates.agent(uriInfo).build(project.getIdentity(), created.getIdentity()))
        .entity(AgentModel.of(project, created, uriInfo))
        .build();
  }

  private Ref<String> toRef(String id) {
    if (id == null || id.isBlank()) {
      return null;
    }
    return new Ref<>(id);
  }

  @Data
  @NoArgsConstructor
  public static class CreateAgentRequest {
    @NotBlank private String name;
    @NotNull private AgentDescription.Role role;

    private String modelTier;
    private AgentDescription.Status status;
    private String parentId;
  }
}
