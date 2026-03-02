package reengineering.ddd.teamai.api.representation;

import com.fasterxml.jackson.annotation.JsonProperty;
import com.fasterxml.jackson.annotation.JsonUnwrapped;
import jakarta.ws.rs.core.UriInfo;
import org.springframework.hateoas.Link;
import org.springframework.hateoas.RepresentationModel;
import org.springframework.hateoas.mediatype.Affordances;
import org.springframework.hateoas.server.core.Relation;
import org.springframework.http.HttpMethod;
import reengineering.ddd.archtype.Ref;
import reengineering.ddd.teamai.api.AgentApi;
import reengineering.ddd.teamai.api.ApiTemplates;
import reengineering.ddd.teamai.description.AgentDescription;
import reengineering.ddd.teamai.model.Agent;
import reengineering.ddd.teamai.model.Project;

@Relation(collectionRelation = "agents")
public class AgentModel extends RepresentationModel<AgentModel> {
  @JsonProperty private String id;
  @JsonUnwrapped private AgentDescription description;
  @JsonProperty private Ref<String> project;

  public AgentModel(Project project, Agent agent, UriInfo uriInfo) {
    this.id = agent.getIdentity();
    this.description = agent.getDescription();
    this.project = new Ref<>(project.getIdentity());
  }

  public static AgentModel of(Project project, Agent agent, UriInfo uriInfo) {
    AgentModel model = new AgentModel(project, agent, uriInfo);
    model.add(
        Link.of(
                ApiTemplates.agent(uriInfo)
                    .build(project.getIdentity(), agent.getIdentity())
                    .getPath())
            .withSelfRel());
    model.add(
        Link.of(ApiTemplates.agents(uriInfo).build(project.getIdentity()).getPath())
            .withRel("collection"));

    model.add(
        Affordances.of(
                Link.of(
                        ApiTemplates.agent(uriInfo)
                            .path(AgentApi.class, "updateStatus")
                            .build(project.getIdentity(), agent.getIdentity())
                            .getPath())
                    .withRel("update-agent-status"))
            .afford(HttpMethod.POST)
            .withInput(AgentApi.UpdateAgentStatusRequest.class)
            .withName("update-agent-status")
            .toLink());
    return model;
  }

  public static AgentModel simple(Project project, Agent agent, UriInfo uriInfo) {
    AgentModel model = new AgentModel(project, agent, uriInfo);
    model.add(
        Link.of(
                ApiTemplates.agent(uriInfo)
                    .build(project.getIdentity(), agent.getIdentity())
                    .getPath())
            .withSelfRel());
    return model;
  }
}
