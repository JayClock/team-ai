package reengineering.ddd.teamai.api;

import static io.restassured.RestAssured.given;
import static org.hamcrest.Matchers.hasSize;
import static org.hamcrest.Matchers.is;
import static org.hamcrest.Matchers.notNullValue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import jakarta.ws.rs.core.MediaType;
import java.util.Optional;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.mockito.Mock;
import org.springframework.hateoas.MediaTypes;
import reengineering.ddd.archtype.Ref;
import reengineering.ddd.teamai.description.AgentDescription;
import reengineering.ddd.teamai.description.ProjectDescription;
import reengineering.ddd.teamai.model.Agent;
import reengineering.ddd.teamai.model.Project;

public class AgentsApiTest extends ApiTest {
  private Project project;
  private Agent agent;

  @Mock private Project.Members members;
  @Mock private Project.Conversations conversations;
  @Mock private Project.LogicalEntities logicalEntities;
  @Mock private Project.Diagrams diagrams;
  @Mock private Project.Agents agents;
  @Mock private Project.Tasks tasks;
  @Mock private Project.AgentEvents events;

  @BeforeEach
  void beforeEach() {
    project =
        new Project(
            "project-1",
            new ProjectDescription("Test Project"),
            members,
            conversations,
            logicalEntities,
            diagrams,
            agents,
            tasks,
            events,
            null,
            null,
            null);
    agent =
        new Agent(
            "agent-1",
            new AgentDescription(
                "Crafter",
                AgentDescription.Role.CRAFTER,
                "SMART",
                AgentDescription.Status.PENDING,
                null));

    when(projects.findByIdentity(project.getIdentity())).thenReturn(Optional.of(project));
    when(agents.findAll()).thenReturn(new EntityList<>(agent));
    when(agents.findByIdentity(agent.getIdentity())).thenReturn(Optional.of(agent));
  }

  @Test
  void should_return_agents_collection_with_create_rel() {
    given(documentationSpec)
        .accept(MediaTypes.HAL_FORMS_JSON_VALUE)
        .when()
        .get("/projects/{projectId}/agents", project.getIdentity())
        .then()
        .statusCode(200)
        .body("_embedded.agents", hasSize(1))
        .body("_embedded.agents[0].id", is(agent.getIdentity()))
        .body("_links.self.href", is("/api/projects/" + project.getIdentity() + "/agents?page=0"))
        .body("_links.create-agent.href", is("/api/projects/" + project.getIdentity() + "/agents"))
        .body("_templates.create-agent.method", is("POST"));
  }

  @Test
  void should_create_agent() {
    Agent created =
        new Agent(
            "agent-2",
            new AgentDescription(
                "Gate", AgentDescription.Role.GATE, "FAST", AgentDescription.Status.PENDING, null));
    when(agents.create(any(AgentDescription.class))).thenReturn(created);

    AgentsApi.CreateAgentRequest request = new AgentsApi.CreateAgentRequest();
    request.setName("Gate");
    request.setRole(AgentDescription.Role.GATE);
    request.setModelTier("FAST");

    given(documentationSpec)
        .accept(MediaTypes.HAL_FORMS_JSON_VALUE)
        .contentType(MediaType.APPLICATION_JSON)
        .body(request)
        .when()
        .post("/projects/{projectId}/agents", project.getIdentity())
        .then()
        .statusCode(201)
        .body("id", is(created.getIdentity()))
        .body("name", is("Gate"))
        .body("_links.collection.href", is("/api/projects/" + project.getIdentity() + "/agents"));

    verify(agents, times(1)).create(any(AgentDescription.class));
  }

  @Test
  void should_create_specialist_with_prompt() {
    Agent created =
        new Agent(
            "agent-3",
            new AgentDescription(
                "Domain Specialist",
                AgentDescription.Role.SPECIALIST,
                "FAST",
                AgentDescription.Status.PENDING,
                new Ref<>("agent-1"),
                "Focus on bounded context"));
    when(agents.create(any(AgentDescription.class))).thenReturn(created);

    AgentsApi.CreateAgentRequest request = new AgentsApi.CreateAgentRequest();
    request.setName("Domain Specialist");
    request.setRole(AgentDescription.Role.SPECIALIST);
    request.setModelTier("fast");
    request.setParentId("agent-1");
    request.setPrompt("  Focus on bounded context  ");

    given(documentationSpec)
        .accept(MediaTypes.HAL_FORMS_JSON_VALUE)
        .contentType(MediaType.APPLICATION_JSON)
        .body(request)
        .when()
        .post("/projects/{projectId}/agents", project.getIdentity())
        .then()
        .statusCode(201)
        .body("id", is("agent-3"))
        .body("role", is("SPECIALIST"))
        .body("prompt", is("Focus on bounded context"));

    ArgumentCaptor<AgentDescription> captor = ArgumentCaptor.forClass(AgentDescription.class);
    verify(agents).create(captor.capture());
    AgentDescription description = captor.getValue();
    org.junit.jupiter.api.Assertions.assertEquals(
        AgentDescription.Role.SPECIALIST, description.role());
    org.junit.jupiter.api.Assertions.assertEquals("FAST", description.modelTier());
    org.junit.jupiter.api.Assertions.assertEquals("Focus on bounded context", description.prompt());
  }

  @Test
  void should_reject_specialist_without_prompt() {
    AgentsApi.CreateAgentRequest request = new AgentsApi.CreateAgentRequest();
    request.setName("Domain Specialist");
    request.setRole(AgentDescription.Role.SPECIALIST);
    request.setModelTier("SMART");
    request.setPrompt("   ");

    given(documentationSpec)
        .accept(MediaTypes.HAL_FORMS_JSON_VALUE)
        .contentType(MediaType.APPLICATION_JSON)
        .body(request)
        .when()
        .post("/projects/{projectId}/agents", project.getIdentity())
        .then()
        .statusCode(400);

    verify(agents, times(0)).create(any(AgentDescription.class));
  }

  @Test
  void should_return_agent_with_update_status_affordance() {
    given(documentationSpec)
        .accept(MediaTypes.HAL_FORMS_JSON_VALUE)
        .when()
        .get("/projects/{projectId}/agents/{agentId}", project.getIdentity(), agent.getIdentity())
        .then()
        .statusCode(200)
        .body("id", is(agent.getIdentity()))
        .body(
            "_links.update-agent-status.href",
            is(
                "/api/projects/"
                    + project.getIdentity()
                    + "/agents/"
                    + agent.getIdentity()
                    + "/status"))
        .body(
            "_links.update-agent-config.href",
            is(
                "/api/projects/"
                    + project.getIdentity()
                    + "/agents/"
                    + agent.getIdentity()
                    + "/config"))
        .body(
            "_links.delete-agent.href",
            is("/api/projects/" + project.getIdentity() + "/agents/" + agent.getIdentity()));
  }

  @Test
  void should_update_agent_status() {
    AgentApi.UpdateAgentStatusRequest request = new AgentApi.UpdateAgentStatusRequest();
    request.setStatus(AgentDescription.Status.ACTIVE);

    given(documentationSpec)
        .accept(MediaTypes.HAL_FORMS_JSON_VALUE)
        .contentType(MediaType.APPLICATION_JSON)
        .body(request)
        .when()
        .post(
            "/projects/{projectId}/agents/{agentId}/status",
            project.getIdentity(),
            agent.getIdentity())
        .then()
        .statusCode(200)
        .body("id", is(agent.getIdentity()));

    verify(agents, times(1))
        .updateStatus(new Ref<>(agent.getIdentity()), AgentDescription.Status.ACTIVE);
  }

  @Test
  void should_echo_trace_id_header_for_requests() {
    given(documentationSpec)
        .accept(MediaTypes.HAL_FORMS_JSON_VALUE)
        .header("X-Trace-Id", "trace-req-001")
        .when()
        .get("/projects/{projectId}/agents", project.getIdentity())
        .then()
        .statusCode(200)
        .header("X-Trace-Id", is("trace-req-001"))
        .header("X-Trace-Id", notNullValue());
  }

  @Test
  void should_update_agent_config() {
    Agent updated =
        new Agent(
            "agent-1",
            new AgentDescription(
                "Domain Specialist",
                AgentDescription.Role.SPECIALIST,
                "FAST",
                AgentDescription.Status.ACTIVE,
                new Ref<>("agent-2"),
                "Focus on rules"));
    when(agents.findByIdentity(agent.getIdentity()))
        .thenReturn(Optional.of(agent), Optional.of(updated));

    AgentApi.UpdateAgentConfigRequest request = new AgentApi.UpdateAgentConfigRequest();
    request.setName("Domain Specialist");
    request.setRole(AgentDescription.Role.SPECIALIST);
    request.setModelTier("fast");
    request.setStatus(AgentDescription.Status.ACTIVE);
    request.setParentId("agent-2");
    request.setPrompt(" Focus on rules ");

    given(documentationSpec)
        .accept(MediaTypes.HAL_FORMS_JSON_VALUE)
        .contentType(MediaType.APPLICATION_JSON)
        .body(request)
        .when()
        .put(
            "/projects/{projectId}/agents/{agentId}/config",
            project.getIdentity(),
            agent.getIdentity())
        .then()
        .statusCode(200)
        .body("id", is(agent.getIdentity()))
        .body("role", is("SPECIALIST"))
        .body("modelTier", is("FAST"))
        .body("prompt", is("Focus on rules"));

    ArgumentCaptor<AgentDescription> captor = ArgumentCaptor.forClass(AgentDescription.class);
    verify(agents).update(eq(agent.getIdentity()), captor.capture());
    AgentDescription description = captor.getValue();
    org.junit.jupiter.api.Assertions.assertEquals(
        AgentDescription.Role.SPECIALIST, description.role());
    org.junit.jupiter.api.Assertions.assertEquals("FAST", description.modelTier());
    org.junit.jupiter.api.Assertions.assertEquals("Focus on rules", description.prompt());
  }

  @Test
  void should_delete_agent() {
    given(documentationSpec)
        .accept(MediaTypes.HAL_FORMS_JSON_VALUE)
        .when()
        .delete(
            "/projects/{projectId}/agents/{agentId}", project.getIdentity(), agent.getIdentity())
        .then()
        .statusCode(204);

    verify(agents).delete(agent.getIdentity());
  }
}
